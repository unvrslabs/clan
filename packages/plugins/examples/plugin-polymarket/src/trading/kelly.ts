import type { ProbabilityEstimate } from "./probability.js";

export interface KellySizing {
  recommendedSize: number; // USDC
  kellyFraction: number;
  rawKelly: number;
  adjustedKelly: number;
  multipliers: Record<string, number>;
}

export function calculateKellySize(
  estimate: ProbabilityEstimate,
  price: number,
  bankroll: number,
  config: {
    kellyFraction: number;
    maxPositionSizeUsdc: number;
    drawdownLevel: number; // 0-3
  },
): KellySizing {
  const p = estimate.estimatedProbability;
  const q = 1 - p;

  // For a binary outcome paying $1 if correct:
  // odds = (1 - price) / price for buying YES at `price`
  const odds = (1 - price) / price;

  // Kelly formula: f* = (p * (b + 1) - 1) / b
  const rawKelly = (p * (odds + 1) - 1) / odds;

  // Apply fraction (quarter-Kelly for safety)
  let adjustedKelly = rawKelly * config.kellyFraction;

  // Multipliers
  const multipliers: Record<string, number> = {};

  // Confidence multiplier
  const confidenceMultiplier =
    estimate.confidence === "HIGH" ? 1.0
    : estimate.confidence === "MEDIUM" ? 0.7
    : 0.4;
  multipliers.confidence = confidenceMultiplier;
  adjustedKelly *= confidenceMultiplier;

  // Drawdown multiplier
  const drawdownMultiplier = [1.0, 0.5, 0.25, 0.0][config.drawdownLevel] ?? 0;
  multipliers.drawdown = drawdownMultiplier;
  adjustedKelly *= drawdownMultiplier;

  // Clamp to [0, 1]
  adjustedKelly = Math.max(0, Math.min(1, adjustedKelly));

  // Calculate size in USDC
  let recommendedSize = adjustedKelly * bankroll;

  // Cap at max position size
  recommendedSize = Math.min(recommendedSize, config.maxPositionSizeUsdc);

  // Round to 2 decimal places
  recommendedSize = Math.round(recommendedSize * 100) / 100;

  return {
    recommendedSize,
    kellyFraction: config.kellyFraction,
    rawKelly: Math.round(rawKelly * 10000) / 10000,
    adjustedKelly: Math.round(adjustedKelly * 10000) / 10000,
    multipliers,
  };
}
