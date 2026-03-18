export const PLUGIN_ID = "paperclip-polymarket";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "polymarket-dashboard";

export const SLOT_IDS = {
  settingsPage: "polymarket-settings-page",
} as const;

export const EXPORT_NAMES = {
  settingsPage: "PolymarketSettingsPage",
} as const;

export const TOOL_NAMES = {
  listMarkets: "list-markets",
  getOrderbook: "get-orderbook",
  webResearch: "web-research",
  estimateProbability: "estimate-probability",
  placeOrder: "place-order",
  cancelOrder: "cancel-order",
  getPositions: "get-positions",
  getBalance: "get-balance",
  getRiskState: "get-risk-state",
  getPortfolioSummary: "get-portfolio-summary",
  resolveTrade: "resolve-trade",
  checkResolutions: "check-resolutions",
} as const;

export const STATE_KEYS = {
  l2Credentials: "l2-credentials",
  positions: "positions",
  balance: "balance",
  drawdownState: "drawdown-state",
  dailyPnl: "daily-pnl",
  tradeCountToday: "trade-count-today",
  tradeCountDate: "trade-count-date",
  marketCache: "active-markets",
  marketCacheTimestamp: "active-markets-ts",
  peakEquity: "peak-equity",
  equityHistory: "equity-history",
  walletAddress: "wallet-address",
} as const;

export const MARKET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const DEFAULT_CONFIG = {
  polymarketGammaApiUrl: "https://gamma-api.polymarket.com",
  polymarketClobApiUrl: "https://clob.polymarket.com",
  polymarketDataApiUrl: "https://data-api.polymarket.com",
  walletPrivateKeyRef: "",
  walletAddress: "",
  relayerApiKeyRef: "",
  anthropicApiKeyRef: "",
  apifyApiKeyRef: "",
  maxPositionSizeUsdc: 50,
  maxTotalExposureUsdc: 500,
  maxDrawdownPercent: 15,
  minEdgePercent: 5,
  minLiquidityUsdc: 1000,
  kellyFraction: 0.25,
  tradingEnabled: false,
  paperTradingMode: true,
} as const;
