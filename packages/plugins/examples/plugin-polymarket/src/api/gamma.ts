import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "../constants.js";

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  markets: GammaMarket[];
}

export interface GammaMarket {
  id: string;
  question: string;
  description: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  liquidity: string;
  volume: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  acceptingOrders: boolean;
  negRisk: boolean; // true for multi-outcome / neg-risk markets
  outcomePrices: string; // JSON string: "[0.65, 0.35]"
  clobTokenIds: string; // JSON string: "[\"tokenYes\", \"tokenNo\"]"
  tags?: { slug: string; label: string }[];
}

export interface MarketFilters {
  minLiquidity?: number;
  category?: string;
  searchQuery?: string;
  limit?: number;
}

export async function listMarkets(
  ctx: PluginContext,
  filters: MarketFilters = {},
): Promise<GammaMarket[]> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  const baseUrl = config.polymarketGammaApiUrl;
  const limit = Math.min(filters.limit ?? 20, 100);

  const params = new URLSearchParams({
    active: "true",
    closed: "false",
    archived: "false",
    limit: String(limit),
    order: "liquidity",
    ascending: "false",
  });

  if (filters.searchQuery) {
    params.set("slug_like", filters.searchQuery.toLowerCase().replace(/\s+/g, "-"));
  }

  const resp = await ctx.http.fetch(`${baseUrl}/markets?${params}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
  }

  let markets = (await resp.json()) as GammaMarket[];

  // Filter by minimum liquidity
  if (filters.minLiquidity) {
    const min = filters.minLiquidity;
    markets = markets.filter((m) => parseFloat(m.liquidity || "0") >= min);
  }

  // Filter by category/tag
  if (filters.category) {
    const cat = filters.category.toLowerCase();
    markets = markets.filter((m) => m.tags?.some((t) => t.slug === cat || t.label.toLowerCase() === cat));
  }

  return markets;
}

export async function getMarket(
  ctx: PluginContext,
  marketId: string,
): Promise<GammaMarket> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  const resp = await ctx.http.fetch(`${config.polymarketGammaApiUrl}/markets/${marketId}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as GammaMarket;
}

export function parseOutcomePrices(market: GammaMarket): { yes: number; no: number } {
  try {
    const prices = JSON.parse(market.outcomePrices) as string[];
    return { yes: parseFloat(prices[0] || "0.5"), no: parseFloat(prices[1] || "0.5") };
  } catch {
    return { yes: 0.5, no: 0.5 };
  }
}

export function parseClobTokenIds(market: GammaMarket): { yes: string; no: string } {
  try {
    const ids = JSON.parse(market.clobTokenIds) as string[];
    return { yes: ids[0] || "", no: ids[1] || "" };
  } catch {
    return { yes: "", no: "" };
  }
}
