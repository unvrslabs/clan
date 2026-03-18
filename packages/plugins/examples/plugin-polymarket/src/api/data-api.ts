import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG } from "../constants.js";

export interface LeaderboardEntry {
  address: string;
  profit: number;
  volume: number;
  numTrades: number;
  winRate: number;
}

export interface UserTrade {
  id: string;
  market: string;
  asset_id: string;
  side: string;
  price: string;
  size: string;
  timestamp: number;
  status: string;
}

async function getDataApiUrl(ctx: PluginContext): Promise<string> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  return config.polymarketDataApiUrl;
}

export async function getLeaderboard(
  ctx: PluginContext,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const baseUrl = await getDataApiUrl(ctx);
  const resp = await ctx.http.fetch(`${baseUrl}/leaderboard?limit=${limit}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`Data API error: ${resp.status} ${resp.statusText}`);
  }

  return (await resp.json()) as LeaderboardEntry[];
}
