import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_CONFIG,
  EXPORT_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Polymarket",
  description:
    "AI-powered prediction market trading on Polymarket. Autonomous probability estimation, risk management, and order execution.",
  author: "UNVRS Labs",
  categories: ["automation"],
  capabilities: [
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "metrics.write",
    "instance.settings.register",
    "ui.page.register",
    "secrets.read-ref",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      polymarketGammaApiUrl: {
        type: "string",
        title: "Gamma API URL",
        description: "Polymarket Gamma API endpoint for market discovery",
        default: DEFAULT_CONFIG.polymarketGammaApiUrl,
      },
      polymarketClobApiUrl: {
        type: "string",
        title: "CLOB API URL",
        description: "Polymarket CLOB API endpoint for trading",
        default: DEFAULT_CONFIG.polymarketClobApiUrl,
      },
      walletPrivateKeyRef: {
        type: "string",
        title: "Wallet Private Key (Secret Ref)",
        description: "Secret reference for the Polygon wallet private key used for signing orders",
      },
      walletAddress: {
        type: "string",
        title: "Wallet Address (auto-derived)",
        description: "Public Polygon wallet address. Auto-derived from private key on plugin startup — no need to set manually.",
      },
      relayerApiKeyRef: {
        type: "string",
        title: "Relayer API Key (Secret Ref)",
        description: "Secret reference for the Polymarket Relayer API key for gasless order execution",
      },
      anthropicApiKeyRef: {
        type: "string",
        title: "Anthropic API Key (Secret Ref)",
        description: "Secret reference for the Anthropic API key used for probability estimation",
      },
      apifyApiKeyRef: {
        type: "string",
        title: "Apify API Key (Secret Ref)",
        description: "Secret reference for the Apify API key used for web research",
      },
      maxPositionSizeUsdc: {
        type: "number",
        title: "Max Position Size (USDC)",
        description: "Maximum USDC amount for a single position",
        default: DEFAULT_CONFIG.maxPositionSizeUsdc,
      },
      maxTotalExposureUsdc: {
        type: "number",
        title: "Max Total Exposure (USDC)",
        description: "Maximum total USDC exposure across all positions",
        default: DEFAULT_CONFIG.maxTotalExposureUsdc,
      },
      maxDrawdownPercent: {
        type: "number",
        title: "Max Drawdown (%)",
        description: "Maximum drawdown percentage before trading is frozen",
        default: DEFAULT_CONFIG.maxDrawdownPercent,
      },
      minEdgePercent: {
        type: "number",
        title: "Min Edge (%)",
        description: "Minimum edge percentage required to place a trade",
        default: DEFAULT_CONFIG.minEdgePercent,
      },
      minLiquidityUsdc: {
        type: "number",
        title: "Min Market Liquidity (USDC)",
        description: "Minimum market liquidity required",
        default: DEFAULT_CONFIG.minLiquidityUsdc,
      },
      kellyFraction: {
        type: "number",
        title: "Kelly Fraction",
        description: "Fraction of Kelly criterion to use for position sizing (0.25 = quarter-Kelly)",
        default: DEFAULT_CONFIG.kellyFraction,
      },
      tradingEnabled: {
        type: "boolean",
        title: "Trading Enabled (Kill Switch)",
        description: "Master switch — must be ON to place any trades",
        default: DEFAULT_CONFIG.tradingEnabled,
      },
      paperTradingMode: {
        type: "boolean",
        title: "Paper Trading Mode",
        description: "When ON, orders are simulated instead of placed on-chain",
        default: DEFAULT_CONFIG.paperTradingMode,
      },
    },
  },
  tools: [
    {
      name: TOOL_NAMES.listMarkets,
      displayName: "List Polymarket Markets",
      description: "Lists active prediction markets on Polymarket filtered by liquidity, category, and status.",
      parametersSchema: {
        type: "object",
        properties: {
          minLiquidity: { type: "number", description: "Minimum liquidity in USDC" },
          category: { type: "string", description: "Market category filter (e.g. politics, crypto, sports)" },
          searchQuery: { type: "string", description: "Search query to filter markets by question text" },
          limit: { type: "number", description: "Maximum number of markets to return (default 20)" },
        },
      },
    },
    {
      name: TOOL_NAMES.getOrderbook,
      displayName: "Get Order Book",
      description: "Gets the current order book (bids and asks) for a specific market token.",
      parametersSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "The condition token ID for the market outcome" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: TOOL_NAMES.webResearch,
      displayName: "Web Research",
      description: "Searches the web for the latest news and information about a topic using Apify RAG Web Browser. Returns real-time data from multiple sources.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query for web research" },
          maxResults: { type: "number", description: "Maximum number of results (default 5)" },
        },
        required: ["query"],
      },
    },
    {
      name: TOOL_NAMES.estimateProbability,
      displayName: "Estimate Probability",
      description: "Records and calibrates a probability estimate from the agent. The agent reasons about probability itself, then passes the result here for Platt scaling, edge calculation, and logging.",
      parametersSchema: {
        type: "object",
        properties: {
          marketId: { type: "string", description: "Polymarket market/condition ID" },
          question: { type: "string", description: "The market question" },
          description: { type: "string", description: "Additional market context" },
          currentYesPrice: { type: "number", description: "Current YES share price (0.00-1.00)" },
          probability: { type: "number", description: "Agent's estimated probability (1-99)" },
          confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"], description: "Confidence level" },
          reasoning: { type: "string", description: "Agent's reasoning for the estimate" },
          sources: {
            type: "array",
            description: "Sources used for analysis",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
        required: ["question", "currentYesPrice", "probability", "confidence", "reasoning"],
      },
    },
    {
      name: TOOL_NAMES.placeOrder,
      displayName: "Place Order",
      description: "Places a limit order on Polymarket (subject to all risk checks). Requires trading to be enabled.",
      parametersSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "The condition token ID" },
          side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
          outcome: { type: "string", enum: ["YES", "NO"], description: "Which outcome to trade" },
          price: { type: "number", description: "Limit price (0.01-0.99)" },
          size: { type: "number", description: "Order size in USDC" },
          marketQuestion: { type: "string", description: "Market question (for record keeping)" },
          negRisk: { type: "boolean", description: "Whether this is a neg-risk market (multi-outcome). Get this from list-markets output." },
          proposalIssueId: { type: "string", description: "Issue ID of the approved trade proposal" },
        },
        required: ["tokenId", "side", "outcome", "price", "size"],
      },
    },
    {
      name: TOOL_NAMES.cancelOrder,
      displayName: "Cancel Order",
      description: "Cancels an open order on Polymarket.",
      parametersSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order ID to cancel" },
        },
        required: ["orderId"],
      },
    },
    {
      name: TOOL_NAMES.getPositions,
      displayName: "Get Positions",
      description: "Gets current open positions and their P&L on Polymarket.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.getBalance,
      displayName: "Get Balance",
      description: "Gets the current USDC balance on Polymarket.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.getRiskState,
      displayName: "Get Risk State",
      description: "Gets the current risk management state: drawdown level, exposure, daily P&L, trade count.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.getPortfolioSummary,
      displayName: "Get Portfolio Summary",
      description: "Gets a high-level portfolio summary: total value, P&L, win rate, positions count, risk level.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.resolveTrade,
      displayName: "Resolve Trade",
      description: "Resolves an open trade and calculates P&L. Provide the resolution outcome (YES/NO won).",
      parametersSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "The order ID to resolve" },
          resolvedOutcome: { type: "string", enum: ["YES", "NO"], description: "Which outcome won" },
          exitPrice: { type: "number", description: "Exit price (defaults to 1.0 if won, 0.0 if lost)" },
        },
        required: ["orderId", "resolvedOutcome"],
      },
    },
    {
      name: TOOL_NAMES.checkResolutions,
      displayName: "Check Market Resolutions",
      description: "Scans all open positions and checks if their markets have resolved. Automatically settles trades.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "Polymarket Settings",
        exportName: EXPORT_NAMES.settingsPage,
      },
    ],
  },
};

export default manifest;
