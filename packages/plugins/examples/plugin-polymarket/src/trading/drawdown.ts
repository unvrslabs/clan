import type { PluginContext } from "@paperclipai/plugin-sdk";
import { STATE_KEYS } from "../constants.js";

export interface DrawdownState {
  level: 0 | 1 | 2 | 3;
  levelLabel: "NORMAL" | "CAUTION" | "WARNING" | "FROZEN";
  peakEquity: number;
  currentEquity: number;
  drawdownPercent: number;
}

const LEVEL_THRESHOLDS = [
  { level: 0 as const, label: "NORMAL" as const, maxDrawdown: 5 },
  { level: 1 as const, label: "CAUTION" as const, maxDrawdown: 10 },
  { level: 2 as const, label: "WARNING" as const, maxDrawdown: 15 },
  { level: 3 as const, label: "FROZEN" as const, maxDrawdown: Infinity },
];

export function calculateDrawdownLevel(drawdownPercent: number): {
  level: 0 | 1 | 2 | 3;
  label: "NORMAL" | "CAUTION" | "WARNING" | "FROZEN";
} {
  for (const threshold of LEVEL_THRESHOLDS) {
    if (drawdownPercent < threshold.maxDrawdown) {
      return { level: threshold.level, label: threshold.label };
    }
  }
  return { level: 3, label: "FROZEN" };
}

export async function getDrawdownState(
  ctx: PluginContext,
  companyId: string,
  currentEquity?: number,
): Promise<DrawdownState> {
  const stored = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "risk",
    stateKey: STATE_KEYS.drawdownState,
  }) as { peakEquity?: number; currentEquity?: number } | null;

  const peak = stored?.peakEquity ?? currentEquity ?? 0;
  const current = currentEquity ?? stored?.currentEquity ?? peak;

  // Update peak if current is higher
  const newPeak = Math.max(peak, current);
  const drawdownPercent = newPeak > 0 ? ((newPeak - current) / newPeak) * 100 : 0;
  const { level, label } = calculateDrawdownLevel(drawdownPercent);

  return {
    level,
    levelLabel: label,
    peakEquity: newPeak,
    currentEquity: current,
    drawdownPercent: Math.round(drawdownPercent * 100) / 100,
  };
}

export async function updateDrawdownState(
  ctx: PluginContext,
  companyId: string,
  state: DrawdownState,
): Promise<void> {
  await ctx.state.set(
    {
      scopeKind: "company",
      scopeId: companyId,
      namespace: "risk",
      stateKey: STATE_KEYS.drawdownState,
    },
    {
      peakEquity: state.peakEquity,
      currentEquity: state.currentEquity,
      level: state.level,
      drawdownPercent: state.drawdownPercent,
      updatedAt: new Date().toISOString(),
    },
  );
}
