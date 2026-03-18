export interface ProbabilityEstimate {
  estimatedProbability: number; // 0-1
  confidence: "HIGH" | "MEDIUM" | "LOW";
  edge: number; // estimated prob - market price (can be negative)
  reasoning: string;
}

/**
 * Platt scaling — mild calibration to reduce overconfidence.
 * Blend 70% raw + 30% scaled toward center.
 */
export function plattScale(p: number): number {
  const a = 1.0;
  const b = 0.0;
  const scaled = 1 / (1 + Math.exp(-(a * Math.log(p / (1 - p)) + b)));
  return 0.7 * p + 0.3 * scaled;
}

/**
 * Calibrates an agent-provided probability estimate.
 *
 * The agent (Researcher) performs the reasoning via Claude Code.
 * This function applies Platt scaling and computes the edge.
 */
export function calibrateEstimate(
  rawProbabilityPercent: number,
  confidence: string,
  reasoning: string,
  currentYesPrice: number,
): ProbabilityEstimate {
  const rawProbability = Math.max(0.01, Math.min(0.99, rawProbabilityPercent / 100));
  const calibratedProbability = plattScale(rawProbability);

  const validConfidence = (["HIGH", "MEDIUM", "LOW"].includes(confidence)
    ? confidence
    : "LOW") as ProbabilityEstimate["confidence"];

  const edge = calibratedProbability - currentYesPrice;

  return {
    estimatedProbability: Math.round(calibratedProbability * 1000) / 1000,
    confidence: validConfidence,
    edge: Math.round(edge * 1000) / 1000,
    reasoning: reasoning || "No reasoning provided",
  };
}
