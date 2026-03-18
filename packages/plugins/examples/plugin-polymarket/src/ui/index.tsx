import { usePluginData, useHostContext } from "@paperclipai/plugin-sdk/ui";

export function PolymarketSettingsPage() {
  const { companyId } = useHostContext();
  const { data: summary } = usePluginData<{
    drawdown: { level: number; levelLabel: string; drawdownPercent: number; peakEquity: number; currentEquity: number };
    tradingEnabled: boolean;
    paperTradingMode: boolean;
    maxPositionSize: number;
    maxExposure: number;
  }>("portfolio-summary", { companyId: companyId ?? "" });

  const drawdownColors = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
  const drawdownColor = summary ? drawdownColors[summary.drawdown.level] || "#6b7280" : "#6b7280";

  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 600 }}>
      <div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
          Polymarket Trading
        </h2>
        <p style={{ fontSize: "0.8rem", opacity: 0.5, margin: "0.5rem 0 0", lineHeight: 1.5 }}>
          AI-powered prediction market trading. Configure risk parameters and monitor status.
        </p>
      </div>

      {/* Status Card */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Trading Status</span>
          <span style={{
            padding: "0.25rem 0.75rem",
            borderRadius: 9999,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#fff",
            background: summary?.tradingEnabled ? (summary.paperTradingMode ? "#3b82f6" : "#22c55e") : "#6b7280",
          }}>
            {summary?.tradingEnabled
              ? summary.paperTradingMode ? "PAPER MODE" : "LIVE"
              : "DISABLED"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.7rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Drawdown
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: drawdownColor }}>
              {summary?.drawdown.drawdownPercent.toFixed(1) ?? "0.0"}%
            </div>
            <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
              {summary?.drawdown.levelLabel ?? "NORMAL"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Max Position
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              ${summary?.maxPositionSize ?? 50}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Max Exposure
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              ${summary?.maxExposure ?? 500}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Peak Equity
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              ${summary?.drawdown.peakEquity?.toFixed(2) ?? "0.00"}
            </div>
          </div>
        </div>
      </div>

      {/* Risk Parameters Info */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>Risk Parameters</span>
        <p style={{ fontSize: "0.75rem", opacity: 0.5, margin: "0.5rem 0 0", lineHeight: 1.6 }}>
          Configure trading parameters in the Instance Settings above. Key settings:
          Trading Enabled (kill switch), Paper Trading Mode, Max Position Size,
          Max Total Exposure, Min Edge %, Kelly Fraction, and Max Drawdown %.
        </p>
      </div>
    </div>
  );
}
