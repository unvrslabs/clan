import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "../constants.js";

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  market: string;
  asset_id: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  hash: string;
  timestamp: string;
}

export interface OrderResponse {
  orderID: string;
  status: string;
  transactionsHashes?: string[];
}

export interface OpenOrder {
  id: string;
  status: string;
  asset_id: string;
  side: string;
  price: string;
  original_size: string;
  size_matched: string;
  created_at: number;
}

export interface Position {
  asset: string;
  conditionId: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  pnl: string;
  realizedPnl: string;
  percentPnl: string;
  curValue: string;
  market?: string;
}

async function getClobBaseUrl(ctx: PluginContext): Promise<string> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  return config.polymarketClobApiUrl;
}

export async function getOrderBook(
  ctx: PluginContext,
  tokenId: string,
): Promise<OrderBook> {
  const baseUrl = await getClobBaseUrl(ctx);
  const resp = await ctx.http.fetch(`${baseUrl}/book?token_id=${tokenId}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`CLOB API error: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as OrderBook;
}

export async function getMidpoint(
  ctx: PluginContext,
  tokenId: string,
): Promise<number> {
  const baseUrl = await getClobBaseUrl(ctx);
  const resp = await ctx.http.fetch(`${baseUrl}/midpoint?token_id=${tokenId}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`CLOB API error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { mid: string };
  return parseFloat(data.mid);
}

export async function getSpread(
  ctx: PluginContext,
  tokenId: string,
): Promise<{ bid: number; ask: number; spread: number }> {
  const baseUrl = await getClobBaseUrl(ctx);
  const resp = await ctx.http.fetch(`${baseUrl}/spread?token_id=${tokenId}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`CLOB API error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { bid: string; ask: string; spread: string };
  return {
    bid: parseFloat(data.bid),
    ask: parseFloat(data.ask),
    spread: parseFloat(data.spread),
  };
}

export async function getPrice(
  ctx: PluginContext,
  tokenId: string,
): Promise<number> {
  const baseUrl = await getClobBaseUrl(ctx);
  const resp = await ctx.http.fetch(`${baseUrl}/price?token_id=${tokenId}&side=buy`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`CLOB API error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { price: string };
  return parseFloat(data.price);
}

// Note: Authenticated endpoints (placeOrder, cancelOrder, getPositions)
// require L2 HMAC-SHA256 credentials. Since we can't use the native
// @polymarket/clob-client inside the plugin worker (it depends on ethers
// which is heavy), we implement the HMAC signing ourselves or use paper
// trading mode where these calls are simulated.

export async function placeOrderPaper(
  _ctx: PluginContext,
  params: {
    tokenId: string;
    side: "BUY" | "SELL";
    price: number;
    size: number;
    marketQuestion?: string;
  },
): Promise<OrderResponse> {
  // Paper trading — simulate order placement
  const orderId = `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    `[polymarket] PAPER ORDER: ${params.side} ${params.size} USDC @ $${params.price} on ${params.tokenId}`,
  );
  return {
    orderID: orderId,
    status: "MATCHED",
  };
}

export async function cancelOrderPaper(
  _ctx: PluginContext,
  orderId: string,
): Promise<{ success: boolean }> {
  console.log(`[polymarket] PAPER CANCEL: ${orderId}`);
  return { success: true };
}
