import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, STATE_KEYS } from "../constants.js";
import type { DrawdownState } from "./drawdown.js";
import type { KellySizing } from "./kelly.js";

export interface TradeProposal {
  tokenId: string;
  side: "BUY" | "SELL";
  outcome: "YES" | "NO";
  price: number;
  size: number;
  edge: number;
  marketQuestion?: string;
  marketLiquidity?: number;
  spreadPercent?: number;
  resolutionDate?: string;
  category?: string;
  kellySizing?: KellySizing;
}

export interface RiskCheckResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  failedChecks: string[];
}

export async function validateTradeProposal(
  ctx: PluginContext,
  companyId: string,
  proposal: TradeProposal,
  drawdown: DrawdownState,
  currentPositions: { tokenId: string; category?: string }[],
  balance: number,
): Promise<RiskCheckResult> {
  const config = { ...DEFAULT_CONFIG, ...(await ctx.config.get()) } as typeof DEFAULT_CONFIG;
  const checks: { name: string; passed: boolean; detail: string }[] = [];

  // 1. Kill switch
  checks.push({
    name: "Trading Enabled",
    passed: config.tradingEnabled,
    detail: config.tradingEnabled ? "Trading is enabled" : "Trading is DISABLED (kill switch OFF)",
  });

  // 2. Paper trading awareness
  checks.push({
    name: "Paper Trading Check",
    passed: true, // Always passes — just informational
    detail: config.paperTradingMode ? "Paper trading mode (simulated)" : "LIVE trading mode",
  });

  // 3. Drawdown
  checks.push({
    name: "Drawdown Level",
    passed: drawdown.level < 3,
    detail: `Drawdown: ${drawdown.drawdownPercent}% (Level ${drawdown.level}: ${drawdown.levelLabel})`,
  });

  // 4. Position size
  checks.push({
    name: "Position Size Limit",
    passed: proposal.size <= config.maxPositionSizeUsdc,
    detail: `Size: $${proposal.size} / Max: $${config.maxPositionSizeUsdc}`,
  });

  // 5. Total exposure
  const currentExposure = currentPositions.length * config.maxPositionSizeUsdc; // Rough estimate
  const newExposure = currentExposure + proposal.size;
  checks.push({
    name: "Total Exposure Limit",
    passed: newExposure <= config.maxTotalExposureUsdc,
    detail: `New exposure: ~$${newExposure} / Max: $${config.maxTotalExposureUsdc}`,
  });

  // 6. Minimum edge
  const absEdge = Math.abs(proposal.edge) * 100;
  checks.push({
    name: "Minimum Edge",
    passed: absEdge >= config.minEdgePercent,
    detail: `Edge: ${absEdge.toFixed(1)}% / Min: ${config.minEdgePercent}%`,
  });

  // 7. Market liquidity
  const liquidity = proposal.marketLiquidity ?? 0;
  checks.push({
    name: "Market Liquidity",
    passed: liquidity >= config.minLiquidityUsdc,
    detail: `Liquidity: $${liquidity} / Min: $${config.minLiquidityUsdc}`,
  });

  // 8. Time to resolution
  let timeOk = true;
  if (proposal.resolutionDate) {
    const hoursToResolution = (new Date(proposal.resolutionDate).getTime() - Date.now()) / (1000 * 60 * 60);
    timeOk = hoursToResolution > 24;
    checks.push({
      name: "Time to Resolution",
      passed: timeOk,
      detail: `${Math.round(hoursToResolution)}h until resolution (min 24h)`,
    });
  } else {
    checks.push({ name: "Time to Resolution", passed: true, detail: "No resolution date specified" });
  }

  // 9. Price sanity
  checks.push({
    name: "Price Sanity",
    passed: proposal.price >= 0.05 && proposal.price <= 0.95,
    detail: `Price: $${proposal.price} (must be $0.05-$0.95)`,
  });

  // 10. No duplicate position
  const isDuplicate = currentPositions.some((p) => p.tokenId === proposal.tokenId);
  checks.push({
    name: "No Duplicate Position",
    passed: !isDuplicate,
    detail: isDuplicate ? "Already holding a position in this market" : "No existing position",
  });

  // 11. Category exposure
  if (proposal.category) {
    const categoryCount = currentPositions.filter((p) => p.category === proposal.category).length;
    checks.push({
      name: "Category Exposure",
      passed: categoryCount < 3,
      detail: `${categoryCount} positions in "${proposal.category}" (max 3)`,
    });
  } else {
    checks.push({ name: "Category Exposure", passed: true, detail: "No category specified" });
  }

  // 12. Daily trade limit
  const tradeCount = (await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: "risk",
    stateKey: STATE_KEYS.tradeCountToday,
  }) as number | null) ?? 0;
  checks.push({
    name: "Daily Trade Limit",
    passed: tradeCount < 10,
    detail: `${tradeCount} trades today (max 10)`,
  });

  // 13. Kelly sizing
  if (proposal.kellySizing) {
    checks.push({
      name: "Kelly Sizing",
      passed: proposal.size <= proposal.kellySizing.recommendedSize * 1.1, // 10% tolerance
      detail: `Size: $${proposal.size} / Kelly recommends: $${proposal.kellySizing.recommendedSize}`,
    });
  } else {
    checks.push({ name: "Kelly Sizing", passed: true, detail: "No Kelly sizing available" });
  }

  // 14. Spread check
  if (proposal.spreadPercent !== undefined) {
    checks.push({
      name: "Spread Check",
      passed: proposal.spreadPercent < 5,
      detail: `Spread: ${proposal.spreadPercent.toFixed(1)}% (max 5%)`,
    });
  } else {
    checks.push({ name: "Spread Check", passed: true, detail: "No spread data available" });
  }

  // 15. Balance sufficient
  checks.push({
    name: "Balance Sufficient",
    passed: balance >= proposal.size,
    detail: `Balance: $${balance} / Required: $${proposal.size}`,
  });

  const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);
  return {
    passed: failedChecks.length === 0,
    checks,
    failedChecks,
  };
}
