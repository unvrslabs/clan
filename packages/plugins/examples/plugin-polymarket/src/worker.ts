import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginHealthDiagnostics,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { Wallet } from "ethers";
import { DEFAULT_CONFIG, MARKET_CACHE_TTL_MS, STATE_KEYS, TOOL_NAMES } from "./constants.js";
import { listMarkets, parseOutcomePrices, parseClobTokenIds, type MarketFilters, type GammaMarket } from "./api/gamma.js";
import { getOrderBook, getSpread, getPrice, placeOrderPaper, cancelOrderPaper } from "./api/clob.js";
import { placeOrderLive, cancelOrderLive, getBalanceLive, getOpenOrdersLive, ensureAllowance } from "./api/clob-live.js";
import { calibrateEstimate } from "./trading/probability.js";
import { calculateKellySize } from "./trading/kelly.js";
import { getDrawdownState, updateDrawdownState } from "./trading/drawdown.js";
import { validateTradeProposal, type TradeProposal } from "./trading/risk-engine.js";
import { webResearch } from "./api/apify.js";

type PolymarketConfig = typeof DEFAULT_CONFIG;
type P = Record<string, unknown>;

let currentContext: PluginContext | null = null;

async function getConfig(ctx: PluginContext): Promise<PolymarketConfig> {
  const config = await ctx.config.get();
  return { ...DEFAULT_CONFIG, ...(config as PolymarketConfig) };
}

/**
 * Ensures walletAddress is derived and persisted in plugin state when only
 * walletPrivateKeyRef is set. This lets the server route (which has no
 * access to secrets) look up the public address for balance queries.
 * We use a well-known state key "wallet-address" in namespace "clob".
 */
async function ensureWalletAddress(ctx: PluginContext): Promise<void> {
  const config = await getConfig(ctx);
  if (!config.walletPrivateKeyRef) return;

  // Check if already stored
  const stateScope = {
    scopeKind: "instance" as const,
    scopeId: "polymarket-wallet",
    namespace: "clob",
    stateKey: STATE_KEYS.walletAddress,
  };

  const existing = await ctx.state.get(stateScope) as string | null;
  if (existing) return;

  try {
    const pk = await ctx.secrets.resolve(config.walletPrivateKeyRef);
    const wallet = new Wallet(pk);
    const address = wallet.address; // public address
    await ctx.state.set(stateScope, address);
    console.log(`[polymarket] Wallet address derived and saved to state: ${address}`);
  } catch (err) {
    console.warn("[polymarket] Could not derive wallet address from private key:", err);
  }
}

function getCompanyId(params: P): string {
  const id = typeof params.companyId === "string" ? params.companyId : "";
  if (!id) throw new Error("companyId is required");
  return id;
}

// ── Retry helper ────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.warn(`[polymarket] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`, err);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function getBalance(ctx: PluginContext, companyId: string): Promise<number> {
  return (await ctx.state.get({
    scopeKind: "company", scopeId: companyId, namespace: "portfolio", stateKey: STATE_KEYS.balance,
  }) as number | null) ?? 1000;
}

async function setBalance(ctx: PluginContext, companyId: string, balance: number): Promise<void> {
  await ctx.state.set(
    { scopeKind: "company", scopeId: companyId, namespace: "portfolio", stateKey: STATE_KEYS.balance },
    Math.round(balance * 100) / 100,
  );
}

async function recordEquitySnapshot(ctx: PluginContext, companyId: string, equity: number): Promise<void> {
  const history = (await ctx.state.get({
    scopeKind: "company", scopeId: companyId, namespace: "portfolio", stateKey: STATE_KEYS.equityHistory,
  }) as { timestamp: string; equity: number }[] | null) ?? [];

  history.push({ timestamp: new Date().toISOString(), equity: Math.round(equity * 100) / 100 });

  // Keep last 500 data points
  const trimmed = history.length > 500 ? history.slice(-500) : history;
  await ctx.state.set(
    { scopeKind: "company", scopeId: companyId, namespace: "portfolio", stateKey: STATE_KEYS.equityHistory },
    trimmed,
  );
}

async function ensureDailyTradeCountReset(ctx: PluginContext, companyId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const storedDate = (await ctx.state.get({
    scopeKind: "company", scopeId: companyId, namespace: "risk", stateKey: STATE_KEYS.tradeCountDate,
  }) as string | null);

  if (storedDate !== today) {
    await ctx.state.set(
      { scopeKind: "company", scopeId: companyId, namespace: "risk", stateKey: STATE_KEYS.tradeCountToday },
      0,
    );
    await ctx.state.set(
      { scopeKind: "company", scopeId: companyId, namespace: "risk", stateKey: STATE_KEYS.tradeCountDate },
      today,
    );
  }
}

async function getCachedMarkets(ctx: PluginContext, companyId: string, filters: MarketFilters): Promise<GammaMarket[] | null> {
  const ts = (await ctx.state.get({
    scopeKind: "company", scopeId: companyId, namespace: "cache", stateKey: STATE_KEYS.marketCacheTimestamp,
  }) as number | null);

  if (!ts || Date.now() - ts > MARKET_CACHE_TTL_MS) return null;

  return (await ctx.state.get({
    scopeKind: "company", scopeId: companyId, namespace: "cache", stateKey: STATE_KEYS.marketCache,
  }) as GammaMarket[] | null);
}

async function setCachedMarkets(ctx: PluginContext, companyId: string, markets: GammaMarket[]): Promise<void> {
  await ctx.state.set(
    { scopeKind: "company", scopeId: companyId, namespace: "cache", stateKey: STATE_KEYS.marketCache },
    markets,
  );
  await ctx.state.set(
    { scopeKind: "company", scopeId: companyId, namespace: "cache", stateKey: STATE_KEYS.marketCacheTimestamp },
    Date.now(),
  );
}

async function calculateCurrentEquity(ctx: PluginContext, companyId: string): Promise<number> {
  const balance = await getBalance(ctx, companyId);
  const trades = await ctx.entities.list({
    entityType: "polymarket-trade",
    scopeKind: "company",
    scopeId: companyId,
    limit: 200,
  });

  // Open positions unrealized value = sum of size (money at risk)
  const openTrades = (trades ?? []).filter(
    (t: any) => t.status === "filled" || t.status === "paper-filled",
  );
  const openValue = openTrades.reduce((sum: number, t: any) => sum + (t.data?.size ?? 0), 0);
  return balance + openValue;
}

// ── Tool Handlers ───────────────────────────────────────────────────

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  // 1. List Markets
  ctx.tools.register(
    TOOL_NAMES.listMarkets,
    {
      displayName: "List Polymarket Markets",
      description: "Lists active prediction markets on Polymarket filtered by liquidity, category, and status.",
      parametersSchema: {
        type: "object",
        properties: {
          minLiquidity: { type: "number" },
          category: { type: "string" },
          searchQuery: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    async (raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const params = raw as P;
      const filters: MarketFilters = {
        minLiquidity: typeof params.minLiquidity === "number" ? params.minLiquidity : undefined,
        category: typeof params.category === "string" ? params.category : undefined,
        searchQuery: typeof params.searchQuery === "string" ? params.searchQuery : undefined,
        limit: typeof params.limit === "number" ? params.limit : 20,
      };

      // Try cache first (only for unfiltered queries)
      let markets: GammaMarket[];
      const useCache = !filters.searchQuery && !filters.category;
      if (useCache) {
        const cached = await getCachedMarkets(ctx, runCtx.companyId, filters);
        if (cached) {
          markets = cached;
          // Apply minLiquidity filter to cached data
          if (filters.minLiquidity) {
            markets = markets.filter((m) => parseFloat(m.liquidity || "0") >= filters.minLiquidity!);
          }
          if (filters.limit) markets = markets.slice(0, filters.limit);
        } else {
          markets = await withRetry(() => listMarkets(ctx, filters));
          await setCachedMarkets(ctx, runCtx.companyId, markets);
        }
      } else {
        markets = await withRetry(() => listMarkets(ctx, filters));
      }

      const formatted = markets.map((m) => {
        const prices = parseOutcomePrices(m);
        const tokens = parseClobTokenIds(m);
        return {
          id: m.id,
          question: m.question,
          yesPrice: prices.yes,
          noPrice: prices.no,
          liquidity: m.liquidity,
          volume: m.volume,
          endDate: m.endDate,
          yesTokenId: tokens.yes,
          noTokenId: tokens.no,
          negRisk: m.negRisk ?? false,
          tags: m.tags?.map((t) => t.label) ?? [],
        };
      });

      return {
        content: `Found ${formatted.length} active markets:\n${formatted.map((m) => `• ${m.question} (YES: $${m.yesPrice.toFixed(2)}, Liquidity: $${m.liquidity})`).join("\n")}`,
        data: { markets: formatted },
      };
    },
  );

  // 2. Get Orderbook
  ctx.tools.register(
    TOOL_NAMES.getOrderbook,
    {
      displayName: "Get Order Book",
      description: "Gets the current order book for a specific market token.",
      parametersSchema: {
        type: "object",
        properties: { tokenId: { type: "string" } },
        required: ["tokenId"],
      },
    },
    async (raw: unknown): Promise<ToolResult> => {
      const params = raw as P;
      const tokenId = params.tokenId as string;
      const book = await withRetry(() => getOrderBook(ctx, tokenId));
      const spread = await getSpread(ctx, tokenId);

      return {
        content: `Order book for ${tokenId}:\nBest bid: $${spread.bid.toFixed(3)} | Best ask: $${spread.ask.toFixed(3)} | Spread: ${(spread.spread * 100).toFixed(1)}%\nBids: ${book.bids.length} levels | Asks: ${book.asks.length} levels`,
        data: { book, spread },
      };
    },
  );

  // 2b. Web Research
  ctx.tools.register(
    TOOL_NAMES.webResearch,
    {
      displayName: "Web Research",
      description: "Searches the web for the latest news and information about a topic. Uses Apify RAG Web Browser for real-time data gathering.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
    },
    async (raw: unknown): Promise<ToolResult> => {
      const params = raw as P;
      const query = params.query as string;
      const maxResults = typeof params.maxResults === "number" ? params.maxResults : 5;

      const result = await withRetry(() => webResearch(ctx, query, maxResults));

      return {
        content: `Web research for "${query}":\n\n${result.results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.text.slice(0, 300)}...`).join("\n\n")}`,
        data: result,
      };
    },
  );

  // 3. Estimate Probability — accepts the agent's own reasoning
  ctx.tools.register(
    TOOL_NAMES.estimateProbability,
    {
      displayName: "Estimate Probability",
      description: "Records a probability estimate from the agent. The agent should reason about the probability itself and pass the result here for calibration, edge calculation, and logging.",
      parametersSchema: {
        type: "object",
        properties: {
          marketId: { type: "string" },
          question: { type: "string" },
          description: { type: "string" },
          currentYesPrice: { type: "number" },
          probability: { type: "number", description: "Agent's estimated probability (1-99)" },
          confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          reasoning: { type: "string", description: "Agent's reasoning for the estimate" },
          sources: {
            type: "array",
            items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } } },
            description: "Sources used for the analysis",
          },
        },
        required: ["question", "currentYesPrice", "probability", "confidence", "reasoning"],
      },
    },
    async (raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const params = raw as P;
      const question = params.question as string;
      const currentYesPrice = params.currentYesPrice as number;
      const marketId = params.marketId as string | undefined;
      const probability = params.probability as number;
      const confidence = params.confidence as string;
      const reasoning = params.reasoning as string;
      const sources = (params.sources as { title: string; url: string }[]) || [];

      // Calibrate with Platt scaling
      const estimate = calibrateEstimate(probability, confidence, reasoning, currentYesPrice);

      // Determine decision
      const edgePct = Math.round(estimate.edge * 10000) / 100;
      const decision = Math.abs(edgePct) >= 5
        ? (estimate.edge > 0 ? "BUY YES" : "BUY NO")
        : "PASS";

      // Record analysis entity
      try {
        await ctx.entities.upsert({
          entityType: "polymarket-analysis",
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: marketId || `analysis-${Date.now()}`,
          title: question.slice(0, 200),
          status: Math.abs(estimate.edge) * 100 >= 5 ? "opportunity" : "no-edge",
          data: {
            marketId,
            question,
            estimatedProbability: estimate.estimatedProbability,
            rawProbability: probability / 100,
            marketPrice: currentYesPrice,
            edge: estimate.edge,
            edgePercent: edgePct,
            confidence: estimate.confidence,
            reasoning: estimate.reasoning,
            decision,
            sources: sources.slice(0, 10),
            analyzedAt: new Date().toISOString(),
            agentId: runCtx.agentId,
            runId: runCtx.runId,
          },
        });
      } catch (err) {
        console.warn("[polymarket] Failed to record analysis entity:", err);
      }

      const edgePercent = (estimate.edge * 100).toFixed(1);
      const direction = estimate.edge > 0 ? "UNDERPRICED (buy YES)" : "OVERPRICED (buy NO)";

      return {
        content: `Probability estimate for: ${question}\n\nRaw estimate: ${probability}%\nCalibrated (Platt): ${(estimate.estimatedProbability * 100).toFixed(1)}%\nMarket price: ${(currentYesPrice * 100).toFixed(1)}%\nEdge: ${edgePercent}% — Market is ${direction}\nDecision: ${decision}\nConfidence: ${estimate.confidence}\n\nReasoning: ${estimate.reasoning}`,
        data: { ...estimate, decision, rawProbability: probability / 100 },
      };
    },
  );

  // 4. Place Order
  ctx.tools.register(
    TOOL_NAMES.placeOrder,
    {
      displayName: "Place Order",
      description: "Places a limit order on Polymarket (subject to all risk checks).",
      parametersSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string" },
          side: { type: "string", enum: ["BUY", "SELL"] },
          outcome: { type: "string", enum: ["YES", "NO"] },
          price: { type: "number" },
          size: { type: "number" },
          marketQuestion: { type: "string" },
          negRisk: { type: "boolean", description: "Whether this is a neg-risk market (multi-outcome). Get this from list-markets output." },
          proposalIssueId: { type: "string" },
        },
        required: ["tokenId", "side", "outcome", "price", "size"],
      },
    },
    async (raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const params = raw as P;
      const config = await getConfig(ctx);
      const tokenId = params.tokenId as string;
      const side = params.side as "BUY" | "SELL";
      const outcome = params.outcome as "YES" | "NO";
      const price = params.price as number;
      const size = params.size as number;
      const marketQuestion = (params.marketQuestion as string) || "";
      const negRisk = (params.negRisk as boolean) ?? false;

      // Quick kill switch check
      if (!config.tradingEnabled) {
        return { error: "Trading is DISABLED. Enable it in plugin settings to place orders." };
      }

      // Ensure daily trade counter is reset
      await ensureDailyTradeCountReset(ctx, runCtx.companyId);

      // Get current state for risk validation
      const drawdown = await getDrawdownState(ctx, runCtx.companyId);

      // Simplified risk check at execution time
      if (drawdown.level >= 3) {
        return { error: `Trading is FROZEN due to drawdown (${drawdown.drawdownPercent}%). No new trades allowed.` };
      }
      if (size > config.maxPositionSizeUsdc) {
        return { error: `Position size $${size} exceeds maximum $${config.maxPositionSizeUsdc}` };
      }

      // Check balance — in live mode sync from Polymarket first
      let currentBalance: number;
      if (!config.paperTradingMode && config.walletPrivateKeyRef) {
        try {
          const walletKey = await ctx.secrets.resolve(config.walletPrivateKeyRef);
          currentBalance = await getBalanceLive(ctx, walletKey, runCtx.companyId);
          await setBalance(ctx, runCtx.companyId, currentBalance);
        } catch {
          currentBalance = await getBalance(ctx, runCtx.companyId);
        }
      } else {
        currentBalance = await getBalance(ctx, runCtx.companyId);
      }
      if (currentBalance < size) {
        return { error: `Insufficient balance: $${currentBalance.toFixed(2)} < $${size} required` };
      }

      if (config.paperTradingMode) {
        // Paper trading
        const result = await placeOrderPaper(ctx, { tokenId, side, price, size, marketQuestion });

        // Deduct balance for BUY, add for SELL
        const newBalance = side === "BUY" ? currentBalance - size : currentBalance + size;
        await setBalance(ctx, runCtx.companyId, newBalance);

        // Record trade entity
        try {
          await ctx.entities.upsert({
            entityType: "polymarket-trade",
            scopeKind: "company",
            scopeId: runCtx.companyId,
            externalId: result.orderID,
            title: `${side} ${outcome} @ $${price} — ${marketQuestion}`.slice(0, 200),
            status: "paper-filled",
            data: {
              tokenId,
              side,
              outcome,
              price,
              size,
              orderId: result.orderID,
              marketQuestion,
              paperTrade: true,
              fillStatus: "FILLED",
              pnl: 0,
              entryPrice: price,
              placedAt: new Date().toISOString(),
              agentId: runCtx.agentId,
              runId: runCtx.runId,
            },
          });
        } catch (err) {
          console.warn("[polymarket] Failed to record trade entity:", err);
        }

        await ctx.metrics.write("polymarket.trade.count", 1);

        // Increment daily trade count
        const tradeCount = (await ctx.state.get({
          scopeKind: "company",
          scopeId: runCtx.companyId,
          namespace: "risk",
          stateKey: STATE_KEYS.tradeCountToday,
        }) as number | null) ?? 0;
        await ctx.state.set(
          { scopeKind: "company", scopeId: runCtx.companyId, namespace: "risk", stateKey: STATE_KEYS.tradeCountToday },
          tradeCount + 1,
        );

        // Update equity snapshot and drawdown
        const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
        await recordEquitySnapshot(ctx, runCtx.companyId, equity);
        const newDrawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
        await updateDrawdownState(ctx, runCtx.companyId, newDrawdown);

        return {
          content: `[PAPER] Order placed: ${side} ${outcome} ${size} USDC @ $${price}\nOrder ID: ${result.orderID}\nBalance: $${newBalance.toFixed(2)}\nMarket: ${marketQuestion}`,
          data: { ...result, paperTrade: true, balance: newBalance },
        };
      }

      // Live trading via CLOB client with EIP-712 signed orders
      if (!config.walletPrivateKeyRef) {
        return { error: "Live trading requires a wallet private key. Configure walletPrivateKeyRef in plugin settings." };
      }

      let walletPrivateKey: string;
      try {
        walletPrivateKey = await ctx.secrets.resolve(config.walletPrivateKeyRef);
      } catch (err) {
        return { error: `Failed to resolve wallet private key: ${err}` };
      }

      // Ensure walletAddress is persisted for server-side balance queries
      try {
        const wallet = new Wallet(walletPrivateKey);
        await ctx.state.set(
          { scopeKind: "instance", scopeId: "polymarket-wallet", namespace: "clob", stateKey: STATE_KEYS.walletAddress },
          wallet.address,
        );
      } catch { /* non-critical */ }

      // Ensure USDC allowance is set before placing orders
      await ensureAllowance(ctx, walletPrivateKey, runCtx.companyId);

      let result: { orderID: string; status: string };
      try {
        result = await withRetry(() => placeOrderLive(ctx, walletPrivateKey, runCtx.companyId, {
          tokenId, side: side as "BUY" | "SELL", price, size, marketQuestion, negRisk,
        }), 2);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[polymarket] LIVE order FAILED: ${errMsg}`);
        return { error: `CLOB order failed: ${errMsg}. No balance was deducted. Check tokenId, price, and wallet USDC allowance.` };
      }

      // Double-check we got a valid order ID before recording
      if (!result.orderID || result.orderID === "unknown") {
        return { error: `Order was submitted but no valid orderID returned. Response: ${JSON.stringify(result)}` };
      }

      // Deduct balance
      const newBalance = side === "BUY" ? currentBalance - size : currentBalance + size;
      await setBalance(ctx, runCtx.companyId, newBalance);

      // Record trade entity
      try {
        await ctx.entities.upsert({
          entityType: "polymarket-trade",
          scopeKind: "company",
          scopeId: runCtx.companyId,
          externalId: result.orderID,
          title: `${side} ${outcome} @ $${price} — ${marketQuestion}`.slice(0, 200),
          status: "filled",
          data: {
            tokenId, side, outcome, price, size,
            orderId: result.orderID,
            marketQuestion,
            paperTrade: false,
            fillStatus: result.status,
            pnl: 0,
            entryPrice: price,
            placedAt: new Date().toISOString(),
            agentId: runCtx.agentId,
            runId: runCtx.runId,
          },
        });
      } catch (err) {
        console.warn("[polymarket] Failed to record live trade entity:", err);
      }

      await ctx.metrics.write("polymarket.trade.count", 1);
      await ctx.metrics.write("polymarket.trade.live.count", 1);

      // Update equity
      const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
      await recordEquitySnapshot(ctx, runCtx.companyId, equity);
      const newDrawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
      await updateDrawdownState(ctx, runCtx.companyId, newDrawdown);

      return {
        content: `[LIVE] Order placed: ${side} ${outcome} ${size} USDC @ $${price}\nOrder ID: ${result.orderID}\nStatus: ${result.status}\nBalance: $${newBalance.toFixed(2)}\nMarket: ${marketQuestion}`,
        data: { ...result, paperTrade: false, balance: newBalance },
      };
    },
  );

  // 5. Cancel Order
  ctx.tools.register(
    TOOL_NAMES.cancelOrder,
    {
      displayName: "Cancel Order",
      description: "Cancels an open order on Polymarket.",
      parametersSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
    },
    async (raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const params = raw as P;
      const orderId = params.orderId as string;
      const config = await getConfig(ctx);

      if (config.paperTradingMode) {
        await cancelOrderPaper(ctx, orderId);
        return { content: `[PAPER] Order ${orderId} cancelled.`, data: { orderId, cancelled: true } };
      }

      // Live cancel via CLOB client
      if (!config.walletPrivateKeyRef) {
        return { error: "Live cancel requires a wallet private key." };
      }
      let walletPrivateKey: string;
      try {
        walletPrivateKey = await ctx.secrets.resolve(config.walletPrivateKeyRef);
      } catch (err) {
        return { error: `Failed to resolve wallet private key: ${err}` };
      }

      try {
        await cancelOrderLive(ctx, walletPrivateKey, runCtx.companyId, orderId);
        return { content: `[LIVE] Order ${orderId} cancelled.`, data: { orderId, cancelled: true } };
      } catch (err) {
        return { error: `Cancel failed: ${err}` };
      }
    },
  );

  // 6. Get Positions
  ctx.tools.register(
    TOOL_NAMES.getPositions,
    {
      displayName: "Get Positions",
      description: "Gets current open positions and their P&L.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      // Query trade entities to reconstruct positions
      const trades = await ctx.entities.list({
        entityType: "polymarket-trade",
        scopeKind: "company",
        scopeId: runCtx.companyId,
        limit: 100,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openTrades = (trades ?? []).filter(
        (t: any) => t.status === "filled" || t.status === "paper-filled",
      );

      if (openTrades.length === 0) {
        return { content: "No open positions.", data: { positions: [] } };
      }

      return {
        content: `${openTrades.length} position(s):\n${openTrades.map((t: any) => `• ${t.title} (${t.status})`).join("\n")}`,
        data: { positions: openTrades },
      };
    },
  );

  // 7. Get Balance
  ctx.tools.register(
    TOOL_NAMES.getBalance,
    {
      displayName: "Get Balance",
      description: "Gets the current USDC balance.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const config = await getConfig(ctx);

      if (config.paperTradingMode) {
        const balance = await getBalance(ctx, runCtx.companyId);
        const equity = await calculateCurrentEquity(ctx, runCtx.companyId);

        return {
          content: `[PAPER] Cash Balance: $${balance.toFixed(2)} USDC | Total Equity: $${equity.toFixed(2)} USDC`,
          data: { balance, equity, paperMode: true },
        };
      }

      // Live mode: query real USDC balance from Polymarket
      if (!config.walletPrivateKeyRef) {
        return { error: "Live balance requires a wallet private key. Configure walletPrivateKeyRef in plugin settings." };
      }

      let walletPrivateKey: string;
      try {
        walletPrivateKey = await ctx.secrets.resolve(config.walletPrivateKeyRef);
      } catch (err) {
        return { error: `Failed to resolve wallet private key: ${err}` };
      }

      // Ensure walletAddress is persisted in state for the server API
      try {
        const wallet = new Wallet(walletPrivateKey);
        await ctx.state.set(
          { scopeKind: "instance", scopeId: "polymarket-wallet", namespace: "clob", stateKey: STATE_KEYS.walletAddress },
          wallet.address,
        );
      } catch { /* non-critical */ }

      let liveBalance: number;
      let balanceSource = "live";
      try {
        liveBalance = await getBalanceLive(ctx, walletPrivateKey, runCtx.companyId);
        // Sync internal state with live balance
        await setBalance(ctx, runCtx.companyId, liveBalance);
      } catch (err) {
        console.warn("[polymarket] Failed to fetch live balance, falling back to internal:", err);
        liveBalance = await getBalance(ctx, runCtx.companyId);
        balanceSource = "cached";
      }

      const equity = await calculateCurrentEquity(ctx, runCtx.companyId);

      return {
        content: `[LIVE] Cash Balance: $${liveBalance.toFixed(2)} USDC | Total Equity: $${equity.toFixed(2)} USDC (source: ${balanceSource})`,
        data: { balance: liveBalance, equity, paperMode: false, balanceSource },
      };
    },
  );

  // 8. Get Risk State
  ctx.tools.register(
    TOOL_NAMES.getRiskState,
    {
      displayName: "Get Risk State",
      description: "Gets the current risk management state.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const config = await getConfig(ctx);

      // Auto-reset daily counter
      await ensureDailyTradeCountReset(ctx, runCtx.companyId);

      const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
      const drawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
      await updateDrawdownState(ctx, runCtx.companyId, drawdown);

      const tradeCount = (await ctx.state.get({
        scopeKind: "company",
        scopeId: runCtx.companyId,
        namespace: "risk",
        stateKey: STATE_KEYS.tradeCountToday,
      }) as number | null) ?? 0;

      const riskState = {
        drawdownLevel: drawdown.level,
        drawdownLabel: drawdown.levelLabel,
        drawdownPercent: drawdown.drawdownPercent,
        peakEquity: drawdown.peakEquity,
        currentEquity: drawdown.currentEquity,
        tradesToday: tradeCount,
        maxTradesPerDay: 10,
        tradingEnabled: config.tradingEnabled,
        paperTradingMode: config.paperTradingMode,
        maxPositionSize: config.maxPositionSizeUsdc,
        maxExposure: config.maxTotalExposureUsdc,
        minEdge: config.minEdgePercent,
      };

      const emoji = ["\u{1F7E2}", "\u{1F7E1}", "\u{1F7E0}", "\u{1F534}"][drawdown.level] || "\u26AA";

      return {
        content: `Risk State: ${emoji} ${drawdown.levelLabel}\nDrawdown: ${drawdown.drawdownPercent}%\nTrades today: ${tradeCount}/10\nTrading: ${config.tradingEnabled ? "ENABLED" : "DISABLED"}\nMode: ${config.paperTradingMode ? "PAPER" : "LIVE"}`,
        data: riskState,
      };
    },
  );

  // 9. Get Portfolio Summary
  ctx.tools.register(
    TOOL_NAMES.getPortfolioSummary,
    {
      displayName: "Get Portfolio Summary",
      description: "Gets a high-level portfolio summary.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const config = await getConfig(ctx);
      const balance = await getBalance(ctx, runCtx.companyId);
      const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
      const drawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
      await updateDrawdownState(ctx, runCtx.companyId, drawdown);

      // Record equity snapshot
      await recordEquitySnapshot(ctx, runCtx.companyId, equity);

      const trades = await ctx.entities.list({
        entityType: "polymarket-trade",
        scopeKind: "company",
        scopeId: runCtx.companyId,
        limit: 200,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTrades = trades ?? [];
      const openTrades = allTrades.filter((t: any) => t.status === "filled" || t.status === "paper-filled");
      const resolvedTrades = allTrades.filter((t: any) => t.status === "resolved");
      const wins = resolvedTrades.filter((t: any) => (t.data as any)?.pnl > 0).length;
      const winRate = resolvedTrades.length > 0 ? (wins / resolvedTrades.length) * 100 : 0;
      const totalPnl = resolvedTrades.reduce((sum: number, t: any) => sum + ((t.data as any)?.pnl ?? 0), 0);
      const totalExposure = openTrades.reduce((sum: number, t: any) => sum + ((t.data as any)?.size ?? 0), 0);

      const summary = {
        totalTrades: allTrades.length,
        openPositions: openTrades.length,
        resolvedTrades: resolvedTrades.length,
        wins,
        losses: resolvedTrades.length - wins,
        winRate: Math.round(winRate * 10) / 10,
        totalPnl: Math.round(totalPnl * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        equity: Math.round(equity * 100) / 100,
        totalExposure: Math.round(totalExposure * 100) / 100,
        drawdownLevel: drawdown.levelLabel,
        drawdownPercent: drawdown.drawdownPercent,
        tradingEnabled: config.tradingEnabled,
        paperMode: config.paperTradingMode,
      };

      return {
        content: `Portfolio Summary:\nBalance: $${summary.balance} | Equity: $${summary.equity}\nTotal P&L: $${summary.totalPnl}\nTotal trades: ${summary.totalTrades} | Open: ${summary.openPositions}\nResolved: ${summary.resolvedTrades} (${summary.wins}W / ${summary.losses}L)\nWin rate: ${summary.winRate}%\nDrawdown: ${summary.drawdownLevel} (${summary.drawdownPercent}%)\nMode: ${summary.paperMode ? "PAPER" : "LIVE"}`,
        data: summary,
      };
    },
  );
  // 10. Resolve Trade (manually mark a trade as resolved with P&L)
  ctx.tools.register(
    TOOL_NAMES.resolveTrade,
    {
      displayName: "Resolve Trade",
      description: "Resolves an open trade and calculates P&L. For paper trades, provide the resolution outcome (YES/NO won). For trades where the market resolved, this calculates profit/loss automatically.",
      parametersSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order ID to resolve" },
          resolvedOutcome: { type: "string", enum: ["YES", "NO"], description: "Which outcome won" },
          exitPrice: { type: "number", description: "Exit price (optional, defaults to 1.0 if won, 0.0 if lost)" },
        },
        required: ["orderId", "resolvedOutcome"],
      },
    },
    async (raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const params = raw as P;
      const orderId = params.orderId as string;
      const resolvedOutcome = params.resolvedOutcome as "YES" | "NO";
      const exitPrice = typeof params.exitPrice === "number" ? params.exitPrice : undefined;

      // Find the trade
      const trades = await ctx.entities.list({
        entityType: "polymarket-trade",
        scopeKind: "company",
        scopeId: runCtx.companyId,
        limit: 200,
      });

      const trade = (trades ?? []).find((t: any) => t.externalId === orderId);
      if (!trade) {
        return { error: `Trade ${orderId} not found.` };
      }
      if (trade.status === "resolved") {
        return { error: `Trade ${orderId} is already resolved.` };
      }

      const data = trade.data as Record<string, unknown>;
      const side = data.side as string;
      const outcome = data.outcome as string;
      const entryPrice = (data.entryPrice as number) || (data.price as number) || 0;
      const size = (data.size as number) || 0;

      // Calculate P&L
      // If we bought YES and YES won: profit = (1 - entryPrice) * shares
      // If we bought YES and NO won: loss = -entryPrice * shares
      // shares = size / entryPrice
      const shares = entryPrice > 0 ? size / entryPrice : 0;
      const won = outcome === resolvedOutcome;
      const resolvePrice = exitPrice ?? (won ? 1.0 : 0.0);
      const pnl = won
        ? (resolvePrice - entryPrice) * shares
        : (resolvePrice - entryPrice) * shares; // Both cases: (exit - entry) * shares

      const roundedPnl = Math.round(pnl * 100) / 100;

      // Update trade entity
      await ctx.entities.upsert({
        entityType: "polymarket-trade",
        scopeKind: "company",
        scopeId: runCtx.companyId,
        externalId: orderId,
        title: trade.title ?? "",
        status: "resolved",
        data: {
          ...data,
          pnl: roundedPnl,
          resolvedOutcome,
          resolvePrice,
          resolvedAt: new Date().toISOString(),
        },
      });

      // Credit/debit balance: return the position value
      // If won, we get back shares * resolvePrice. If lost, we get shares * resolvePrice (0).
      const returnValue = shares * resolvePrice;
      const currentBalance = await getBalance(ctx, runCtx.companyId);
      const newBalance = currentBalance + returnValue;
      await setBalance(ctx, runCtx.companyId, newBalance);

      // Update equity and drawdown
      const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
      await recordEquitySnapshot(ctx, runCtx.companyId, equity);
      const drawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
      await updateDrawdownState(ctx, runCtx.companyId, drawdown);

      return {
        content: `Trade ${orderId} resolved: ${resolvedOutcome} won\n${won ? "WIN" : "LOSS"}: P&L = ${roundedPnl >= 0 ? "+" : ""}$${roundedPnl.toFixed(2)}\nNew balance: $${newBalance.toFixed(2)}`,
        data: { orderId, pnl: roundedPnl, won, newBalance, resolvedOutcome },
      };
    },
  );

  // 11. Check Resolutions — scan open trades for markets that have resolved
  ctx.tools.register(
    TOOL_NAMES.checkResolutions,
    {
      displayName: "Check Market Resolutions",
      description: "Scans all open positions and checks if their markets have resolved on Polymarket. Automatically resolves trades where markets are closed.",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_raw: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const trades = await ctx.entities.list({
        entityType: "polymarket-trade",
        scopeKind: "company",
        scopeId: runCtx.companyId,
        limit: 200,
      });

      const openTrades = (trades ?? []).filter(
        (t: any) => t.status === "filled" || t.status === "paper-filled",
      );

      if (openTrades.length === 0) {
        return { content: "No open positions to check.", data: { resolved: 0 } };
      }

      let resolvedCount = 0;
      const results: string[] = [];

      for (const trade of openTrades) {
        const data = trade.data as Record<string, unknown>;
        const tokenId = data.tokenId as string;

        try {
          // Check current price — if it's at 0 or 1, market has resolved
          const currentPrice = await getPrice(ctx, tokenId);
          const isResolved = currentPrice >= 0.95 || currentPrice <= 0.05;

          if (isResolved) {
            const resolvedOutcome: "YES" | "NO" = currentPrice >= 0.95 ? "YES" : "NO";
            const outcome = data.outcome as string;
            const entryPrice = (data.entryPrice as number) || (data.price as number) || 0;
            const size = (data.size as number) || 0;
            const shares = entryPrice > 0 ? size / entryPrice : 0;
            const won = outcome === resolvedOutcome;
            const pnl = won ? (1 - entryPrice) * shares : -entryPrice * shares;
            const roundedPnl = Math.round(pnl * 100) / 100;

            await ctx.entities.upsert({
              entityType: "polymarket-trade",
              scopeKind: "company",
              scopeId: runCtx.companyId,
              externalId: trade.externalId!,
              title: trade.title ?? "",
              status: "resolved",
              data: {
                ...data,
                pnl: roundedPnl,
                resolvedOutcome,
                resolvePrice: won ? 1.0 : 0.0,
                resolvedAt: new Date().toISOString(),
              },
            });

            // Credit balance
            const returnValue = won ? shares : 0;
            const balance = await getBalance(ctx, runCtx.companyId);
            await setBalance(ctx, runCtx.companyId, balance + returnValue);

            resolvedCount++;
            results.push(`${won ? "WIN" : "LOSS"} ${trade.externalId}: ${roundedPnl >= 0 ? "+" : ""}$${roundedPnl.toFixed(2)}`);
          }
        } catch (err) {
          // Can't check this market — skip
          console.warn(`[polymarket] Failed to check resolution for ${tokenId}:`, err);
        }
      }

      // Update equity after all resolutions
      if (resolvedCount > 0) {
        const equity = await calculateCurrentEquity(ctx, runCtx.companyId);
        await recordEquitySnapshot(ctx, runCtx.companyId, equity);
        const drawdown = await getDrawdownState(ctx, runCtx.companyId, equity);
        await updateDrawdownState(ctx, runCtx.companyId, drawdown);
      }

      return {
        content: resolvedCount > 0
          ? `Resolved ${resolvedCount} trade(s):\n${results.join("\n")}`
          : `Checked ${openTrades.length} position(s) — none resolved yet.`,
        data: { checked: openTrades.length, resolved: resolvedCount, results },
      };
    },
  );
}

// ── Data Handlers ───────────────────────────────────────────────────

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register("portfolio-summary", async (params: P) => {
    const companyId = getCompanyId(params);
    const drawdown = await getDrawdownState(ctx, companyId);
    const config = await getConfig(ctx);

    return {
      drawdown,
      tradingEnabled: config.tradingEnabled,
      paperTradingMode: config.paperTradingMode,
      maxPositionSize: config.maxPositionSizeUsdc,
      maxExposure: config.maxTotalExposureUsdc,
    };
  });

  ctx.data.register("plugin-config", async () => {
    return await getConfig(ctx);
  });

  ctx.data.register("equity-history", async (params: P) => {
    const companyId = getCompanyId(params);
    return (await ctx.state.get({
      scopeKind: "company",
      scopeId: companyId,
      namespace: "portfolio",
      stateKey: STATE_KEYS.equityHistory,
    }) as { timestamp: string; equity: number }[] | null) ?? [];
  });
}

// ── Plugin Definition ───────────────────────────────────────────────

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx: PluginContext) {
    currentContext = ctx;
    // Derive & persist public wallet address from private key (if configured)
    await ensureWalletAddress(ctx);
    await registerDataHandlers(ctx);
    await registerToolHandlers(ctx);
  },

  async onHealth(): Promise<PluginHealthDiagnostics> {
    const ctx = currentContext;
    const config = ctx ? await getConfig(ctx) : DEFAULT_CONFIG;

    const warnings: string[] = [];
    if (config.tradingEnabled && !config.paperTradingMode) {
      if (!config.walletPrivateKeyRef) warnings.push("LIVE trading enabled but walletPrivateKeyRef not configured!");
    }
    if (!config.apifyApiKeyRef) warnings.push("apifyApiKeyRef not configured — web research will fail");

    const hasWarnings = warnings.length > 0;
    let message: string;
    if (!config.tradingEnabled) {
      message = "Polymarket plugin ready (trading DISABLED — enable tradingEnabled in settings)";
    } else if (config.paperTradingMode) {
      message = "Polymarket plugin ready (paper trading)";
    } else if (hasWarnings) {
      message = `Polymarket LIVE trading — WARNINGS: ${warnings.join("; ")}`;
    } else {
      message = "Polymarket plugin ready (LIVE trading)";
    }

    return {
      status: hasWarnings ? "degraded" : "ok",
      message,
      details: {
        tradingEnabled: config.tradingEnabled,
        paperTradingMode: config.paperTradingMode,
        walletConfigured: !!config.walletPrivateKeyRef,
        apifyConfigured: !!config.apifyApiKeyRef,
        warnings,
      },
    };
  },

  async onConfigChanged() {
    // Re-derive wallet address if private key changed
    if (currentContext) {
      await ensureWalletAddress(currentContext);
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
