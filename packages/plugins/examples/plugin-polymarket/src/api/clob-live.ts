import { ClobClient, Side, AssetType } from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, STATE_KEYS } from "../constants.js";

const CHAIN_ID = 137; // Polygon mainnet

/**
 * Creates an authenticated ClobClient ready for live trading.
 * Derives L2 credentials on first call and caches them in plugin state.
 * If forceDerive is true, ignores cached credentials and re-derives.
 */
export async function createClobClient(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
  forceDerive = false,
): Promise<ClobClient> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  const host = config.polymarketClobApiUrl;
  const signer = new Wallet(walletPrivateKey);

  const stateScope = {
    scopeKind: "company" as const,
    scopeId: companyId,
    namespace: "clob",
    stateKey: STATE_KEYS.l2Credentials,
  };

  // Try to load cached L2 credentials (unless forced to re-derive)
  let creds: ApiKeyCreds | null = null;
  if (!forceDerive) {
    try {
      const stored = (await ctx.state.get(stateScope as any)) as any;
      if (stored && typeof stored === "object" && "key" in stored) {
        creds = stored as ApiKeyCreds;
      }
    } catch {
      // No cached creds
    }
  }

  if (!creds) {
    // Derive L2 credentials from wallet
    console.log("[polymarket] Deriving L2 API credentials from wallet...");
    const tempClient = new ClobClient(host, CHAIN_ID, signer);
    creds = await tempClient.createOrDeriveApiKey();
    // Cache for future use
    await ctx.state.set(stateScope as any, creds as any);
    console.log("[polymarket] L2 credentials derived and cached.");
  }

  return new ClobClient(
    host,
    CHAIN_ID,
    signer,
    creds,
    0, // EOA signature type
    signer.address,
  );
}

/**
 * Places a live order on Polymarket via the CLOB client.
 * Validates the response to ensure the order was actually accepted.
 */
export async function placeOrderLive(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
  params: {
    tokenId: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    marketQuestion?: string;
    negRisk?: boolean;
  },
): Promise<{ orderID: string; status: string }> {
  let client = await createClobClient(ctx, walletPrivateKey, companyId);

  console.log(`[polymarket] Placing LIVE order: ${params.side} ${params.size} USDC @ $${params.price} token=${params.tokenId} negRisk=${params.negRisk}`);

  let response: any;
  try {
    response = await client.createAndPostOrder(
    {
      tokenID: params.tokenId,
      price: params.price,
      size: params.size,
      side: params.side === "BUY" ? Side.BUY : Side.SELL,
    },
    {
      tickSize: "0.01",
      negRisk: params.negRisk ?? false,
    },
  );
  } catch (err) {
    // L2 credentials might be expired — re-derive and retry once
    console.warn("[polymarket] Order failed, re-deriving L2 credentials and retrying...", err);
    client = await createClobClient(ctx, walletPrivateKey, companyId, true);
    response = await client.createAndPostOrder(
      {
        tokenID: params.tokenId,
        price: params.price,
        size: params.size,
        side: params.side === "BUY" ? Side.BUY : Side.SELL,
      },
      {
        tickSize: "0.01",
        negRisk: params.negRisk ?? false,
      },
    );
  }

  console.log("[polymarket] CLOB response:", JSON.stringify(response));

  // Validate response — the SDK may return error info instead of throwing
  if (!response) {
    throw new Error("CLOB API returned empty response — order likely rejected");
  }

  // Check for explicit error in response
  const resp = response as Record<string, unknown>;
  if (resp.errorMsg && typeof resp.errorMsg === "string" && resp.errorMsg.length > 0) {
    throw new Error(`CLOB order rejected: ${resp.errorMsg}`);
  }
  if (resp.status && typeof resp.status === "number" && (resp.status as number) >= 400) {
    throw new Error(`CLOB order failed with HTTP ${resp.status}: ${JSON.stringify(resp)}`);
  }
  if (resp.success === false) {
    throw new Error(`CLOB order rejected: ${JSON.stringify(resp)}`);
  }

  const orderID = (resp.orderID as string) ?? (resp.id as string) ?? "";
  if (!orderID || orderID === "unknown") {
    throw new Error(`CLOB order did not return a valid orderID: ${JSON.stringify(resp)}`);
  }

  return {
    orderID,
    status: (resp.status as string) ?? "SUBMITTED",
  };
}

/**
 * Cancels a live order on Polymarket.
 */
export async function cancelOrderLive(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
  orderId: string,
): Promise<{ success: boolean }> {
  const client = await createClobClient(ctx, walletPrivateKey, companyId);
  await client.cancelOrder({ orderID: orderId });
  return { success: true };
}

/**
 * Gets live USDC balance from Polymarket CLOB API.
 * The CLOB API returns balances in raw units (USDC has 6 decimals),
 * so we divide by 1e6 to get human-readable USDC amounts.
 * If cached L2 credentials fail (403), re-derives them automatically.
 */
export async function getBalanceLive(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
): Promise<number> {
  let client = await createClobClient(ctx, walletPrivateKey, companyId);

  let resp: { balance?: string };
  try {
    resp = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  } catch (err) {
    // L2 credentials might be expired/invalid — re-derive and retry
    console.warn("[polymarket] Balance fetch failed, re-deriving L2 credentials...", err);
    client = await createClobClient(ctx, walletPrivateKey, companyId, true);
    resp = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  }

  console.log("[polymarket] Balance response:", JSON.stringify(resp));

  // Per Polymarket docs: balance is returned as a decimal string in USDC
  // (already human-readable, NOT in wei/micro-USDC)
  const balance = parseFloat(resp.balance ?? "0") || 0;
  return balance;
}

/**
 * Ensures USDC allowance is set for the Exchange contract.
 * Must be called before placing the first order.
 */
export async function ensureAllowance(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
): Promise<void> {
  const client = await createClobClient(ctx, walletPrivateKey, companyId);
  try {
    const allowance = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    console.log("[polymarket] Current allowance:", JSON.stringify(allowance));
    // If allowance is 0 or very low, update it
    const currentAllowance = parseFloat(allowance.allowance ?? "0");
    if (currentAllowance < 1000) {
      console.log("[polymarket] Setting USDC allowance for Exchange contract...");
      await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      console.log("[polymarket] Allowance updated.");
    }
  } catch (err) {
    console.warn("[polymarket] Failed to check/set allowance:", err);
  }
}

/**
 * Gets live open orders from Polymarket CLOB API.
 */
export async function getOpenOrdersLive(
  ctx: PluginContext,
  walletPrivateKey: string,
  companyId: string,
): Promise<any[]> {
  const client = await createClobClient(ctx, walletPrivateKey, companyId);
  const orders = await client.getOpenOrders();
  return Array.isArray(orders) ? orders : [];
}
