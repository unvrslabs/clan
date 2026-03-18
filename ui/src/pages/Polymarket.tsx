import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  BarChart3,
  Target,
  Activity,
  Play,
  Square,
  Loader2,
  Wallet,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileSearch,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Bot,
  LineChart,
} from "lucide-react";
import {
  polymarketApi,
  type PolymarketAnalysis,
  type EquitySnapshot,
} from "../api/polymarket";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PolymarketTradeCard } from "../components/PolymarketTradeCard";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POLYMARKET_AGENT_NAMES = new Set([
  "Trading Director",
  "Market Analyst",
  "Research Agent",
  "Risk Manager",
  "Trader",
]);

function KpiCard({
  label,
  value,
  subValue,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: typeof TrendingUp;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl card-border-light bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor || ""}`}>{value}</div>
      {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
    </div>
  );
}

// ── Equity Curve Chart ──────────────────────────────────────────────

function EquityCurveChart({ data }: { data: EquitySnapshot[] }) {
  const points = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Sample max 60 points for smooth rendering
    const step = Math.max(1, Math.floor(data.length / 60));
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
        Dati insufficienti per il grafico. Gli agenti genereranno la curva durante il trading.
      </div>
    );
  }

  const values = points.map((p) => p.equity);
  const min = Math.min(...values) * 0.98;
  const max = Math.max(...values) * 1.02;
  const range = max - min || 1;
  const chartW = 100;
  const chartH = 100;

  const pathPoints = points.map((p, i) => {
    const x = (i / (points.length - 1)) * chartW;
    const y = chartH - ((p.equity - min) / range) * chartH;
    return `${x},${y}`;
  });

  const linePath = `M${pathPoints.join(" L")}`;
  const areaPath = `${linePath} L${chartW},${chartH} L0,${chartH} Z`;

  const startEquity = points[0].equity;
  const endEquity = points[points.length - 1].equity;
  const isPositive = endEquity >= startEquity;
  const strokeColor = isPositive ? "#34d399" : "#f87171";
  const fillColor = isPositive ? "rgba(52, 211, 153, 0.1)" : "rgba(248, 113, 113, 0.1)";

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          ${min.toFixed(0)}
        </span>
        <span className={`text-sm font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
          ${endEquity.toFixed(2)}
        </span>
        <span className="text-xs text-muted-foreground">
          ${max.toFixed(0)}
        </span>
      </div>
      <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-32" preserveAspectRatio="none">
        <path d={areaPath} fill={fillColor} />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {/* Start/end dots */}
        {pathPoints.length > 0 && (
          <>
            <circle cx={0} cy={chartH - ((startEquity - min) / range) * chartH} r="2" fill={strokeColor} vectorEffect="non-scaling-stroke" />
            <circle cx={chartW} cy={chartH - ((endEquity - min) / range) * chartH} r="2" fill={strokeColor} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">{formatTime(points[0].timestamp)}</span>
        <span className="text-[9px] text-muted-foreground">{formatTime(points[points.length - 1].timestamp)}</span>
      </div>
    </div>
  );
}

// ── P&L Waterfall Chart ─────────────────────────────────────────────

function PnlWaterfallChart({ trades }: { trades: { pnl: number; question: string }[] }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
        Nessun trade risolto ancora.
      </div>
    );
  }

  const maxAbsPnl = Math.max(...trades.map((t) => Math.abs(t.pnl)), 1);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-20">
        {trades.slice(-30).map((trade, i) => {
          const heightPct = (Math.abs(trade.pnl) / maxAbsPnl) * 100;
          const isWin = trade.pnl >= 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end"
              title={`${trade.question.slice(0, 60)}: ${isWin ? "+" : ""}$${trade.pnl.toFixed(2)}`}
            >
              <div
                className={`rounded-t-sm ${isWin ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground">Meno recente</span>
        <span className="text-[9px] text-muted-foreground">Più recente</span>
      </div>
    </div>
  );
}

// ── Agent Status Card ───────────────────────────────────────────────

function AgentStatusCard({ agent }: { agent: { id: string; name: string; status: string; lastHeartbeatAt?: string } }) {
  const statusColor: Record<string, string> = {
    running: "bg-emerald-400",
    active: "bg-emerald-400",
    idle: "bg-blue-400",
    paused: "bg-zinc-500",
    error: "bg-red-400",
  };

  const statusLabel: Record<string, string> = {
    running: "Attivo",
    active: "Attivo",
    idle: "Inattivo",
    paused: "In pausa",
    error: "Errore",
  };

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return "mai";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ora";
    if (mins < 60) return `${mins}m fa`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h fa`;
    return `${Math.floor(hrs / 24)}g fa`;
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <div className={`h-2 w-2 rounded-full ${statusColor[agent.status] ?? "bg-zinc-600"}`} />
        <div>
          <p className="text-xs font-medium">{agent.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {statusLabel[agent.status] ?? agent.status}
          </p>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground">
        {timeAgo(agent.lastHeartbeatAt)}
      </span>
    </div>
  );
}

// ── Analysis Card ───────────────────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: PolymarketAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const d = analysis.data;
  const isOpportunity = analysis.status === "opportunity";
  const decisionIcon =
    d.decision === "BUY YES" ? (
      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
    ) : d.decision === "BUY NO" ? (
      <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-zinc-400" />
    );

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m fa`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h fa`;
    return `${Math.floor(hrs / 24)}g fa`;
  };

  return (
    <div className="rounded-xl card-border-light bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-sm font-medium line-clamp-2">{d.question}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={
                  isOpportunity
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                }
              >
                {decisionIcon}
                <span className="ml-1">{d.decision || (isOpportunity ? "Opportunità" : "No Edge")}</span>
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {d.confidence}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {timeAgo(d.analyzedAt)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                AI {(d.estimatedProbability * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="text-muted-foreground">
                Mkt {(d.marketPrice * 100).toFixed(0)}%
              </span>
            </div>
            <span
              className={`text-sm font-semibold ${
                Math.abs(d.edgePercent) >= 5 ? "text-emerald-400" : "text-zinc-400"
              }`}
            >
              {d.edgePercent > 0 ? "+" : ""}
              {d.edgePercent.toFixed(1)}% edge
            </span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Ragionamento
            </p>
            <p className="text-xs text-foreground/80 leading-relaxed">{d.reasoning}</p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Stima vs Mercato
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-6 text-right text-muted-foreground">AI</span>
                <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${d.estimatedProbability * 100}%` }}
                  />
                </div>
                <span className="text-[10px] w-8 text-muted-foreground">
                  {(d.estimatedProbability * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-6 text-right text-muted-foreground">Mkt</span>
                <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-zinc-500"
                    style={{ width: `${d.marketPrice * 100}%` }}
                  />
                </div>
                <span className="text-[10px] w-8 text-muted-foreground">
                  {(d.marketPrice * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {d.sources && d.sources.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                Fonti ({d.sources.length})
              </p>
              <div className="space-y-1">
                {d.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors group"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                    <span className="line-clamp-1">{src.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export function Polymarket() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Polymarket" }]);
  }, [setBreadcrumbs]);

  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.polymarket.summary(selectedCompanyId!),
    queryFn: () => polymarketApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: trades } = useQuery({
    queryKey: queryKeys.polymarket.trades(selectedCompanyId!, filter !== "all" ? filter : undefined),
    queryFn: () =>
      polymarketApi.trades(selectedCompanyId!, filter !== "all" ? { status: filter } : undefined),
    enabled: !!selectedCompanyId,
  });

  const { data: analyses } = useQuery({
    queryKey: queryKeys.polymarket.analyses(selectedCompanyId!),
    queryFn: () => polymarketApi.analyses(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: balanceData } = useQuery({
    queryKey: queryKeys.polymarket.balance(selectedCompanyId!),
    queryFn: () => polymarketApi.balance(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const { data: equityHistory } = useQuery({
    queryKey: queryKeys.polymarket.equityHistory(selectedCompanyId!),
    queryFn: () => polymarketApi.equityHistory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const { data: pnlHistory } = useQuery({
    queryKey: queryKeys.polymarket.pnlHistory(selectedCompanyId!),
    queryFn: () => polymarketApi.pnlHistory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const queryClient = useQueryClient();
  const { data: allAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5_000,
  });

  const polyAgents = (allAgents ?? []).filter((a: any) => POLYMARKET_AGENT_NAMES.has(a.name));
  const anyRunning = polyAgents.some((a: any) => a.status === "running" || a.status === "active");
  const allPaused = polyAgents.length > 0 && polyAgents.every((a: any) => a.status === "paused");
  const isActive = anyRunning && !allPaused;

  const toggleAgents = useMutation({
    mutationFn: async (action: "start" | "stop") => {
      for (const agent of polyAgents) {
        if (action === "start") {
          if (agent.status === "paused") {
            await agentsApi.resume(agent.id, selectedCompanyId!);
          }
          await agentsApi.invoke(agent.id, selectedCompanyId!);
        } else {
          await agentsApi.pause(agent.id, selectedCompanyId!);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
    },
  });

  // Cumulative P&L for waterfall
  const cumulativePnl = useMemo(() => {
    if (!pnlHistory || pnlHistory.length === 0) return 0;
    return pnlHistory.reduce((sum, t) => sum + t.pnl, 0);
  }, [pnlHistory]);

  if (!selectedCompanyId) {
    return <EmptyState icon={TrendingUp} message="Seleziona un'azienda per vedere Polymarket." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const pnlColor = (summary?.totalPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlPrefix = (summary?.totalPnl ?? 0) >= 0 ? "+$" : "-$";

  return (
    <div className="space-y-6">
      {/* Agent Control */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isActive
                ? "bg-emerald-400 animate-pulse"
                : allPaused
                  ? "bg-zinc-500"
                  : "bg-zinc-600"
            }`}
          />
          <span className="text-sm text-muted-foreground">
            {isActive
              ? `${polyAgents.filter((a: any) => a.status === "running").length}/${polyAgents.length} agenti attivi`
              : allPaused
                ? "Agenti in pausa"
                : `${polyAgents.length} agenti pronti`}
          </span>
        </div>
        <Button
          size="sm"
          variant={isActive ? "destructive" : "default"}
          onClick={() => toggleAgents.mutate(isActive ? "stop" : "start")}
          disabled={toggleAgents.isPending || polyAgents.length === 0}
          className="gap-2"
        >
          {toggleAgents.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isActive ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {isActive ? "Ferma Agenti" : "Avvia Agenti"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="P&L Totale"
          value={`${pnlPrefix}${Math.abs(summary?.totalPnl ?? 0).toFixed(2)}`}
          icon={TrendingUp}
          valueColor={pnlColor}
        />
        <KpiCard
          label="Posizioni Aperte"
          value={String(summary?.openPositions ?? 0)}
          subValue={`${summary?.totalTrades ?? 0} trade totali`}
          icon={Activity}
        />
        <KpiCard
          label="Win Rate"
          value={`${summary?.winRate ?? 0}%`}
          subValue={`${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`}
          icon={Target}
        />
        <KpiCard
          label="Analisi"
          value={String(summary?.totalAnalyses ?? 0)}
          subValue={`${summary?.opportunities ?? 0} opportunità trovate`}
          icon={BarChart3}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Equity Curve */}
        <div className="rounded-xl card-border-light bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LineChart className="h-3.5 w-3.5" />
            <span>Curva Equity</span>
          </div>
          <EquityCurveChart data={equityHistory ?? []} />
        </div>

        {/* P&L per Trade */}
        <div className="rounded-xl card-border-light bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>P&L per Trade</span>
            </div>
            {pnlHistory && pnlHistory.length > 0 && (
              <span className={`text-xs font-semibold ${cumulativePnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Totale: {cumulativePnl >= 0 ? "+" : ""}${cumulativePnl.toFixed(2)}
              </span>
            )}
          </div>
          <PnlWaterfallChart trades={pnlHistory ?? []} />
        </div>
      </div>

      {/* Portfolio + Agent Activity Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Wallet / Balance Card */}
        <div className="md:col-span-2 rounded-xl card-border-light bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Wallet className="h-3.5 w-3.5" />
            <span>Portfolio</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
              <p className="text-lg font-bold">
                {balanceData?.balance != null
                  ? `$${Number(balanceData.balance).toFixed(2)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Posizioni</p>
              <p className="text-lg font-bold">
                ${balanceData?.positionValue?.toFixed(2) ?? balanceData?.totalExposure?.toFixed(2) ?? "0.00"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Drawdown</p>
              <p className={`text-lg font-bold ${
                (balanceData?.drawdownState?.drawdownPercent ?? 0) > 10
                  ? "text-red-400"
                  : (balanceData?.drawdownState?.drawdownPercent ?? 0) > 5
                    ? "text-yellow-400"
                    : "text-emerald-400"
              }`}>
                {balanceData?.drawdownState
                  ? `${balanceData.drawdownState.drawdownPercent.toFixed(1)}%`
                  : "0.0%"}
              </p>
              {balanceData?.drawdownState?.level && (
                <p className="text-[10px] text-muted-foreground">
                  {balanceData.drawdownState.level}
                </p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Equity</p>
              <p className="text-lg font-bold">
                {balanceData?.equity != null
                  ? `$${Number(balanceData.equity).toFixed(2)}`
                  : balanceData?.peakEquity != null
                    ? `$${Number(balanceData.peakEquity).toFixed(2)}`
                    : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Agent Activity Panel */}
        <div className="rounded-xl card-border-light bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Bot className="h-3.5 w-3.5" />
            <span>Team Agenti</span>
          </div>
          {polyAgents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nessun agente Polymarket configurato.
            </p>
          ) : (
            <div className="divide-y divide-border/30">
              {polyAgents.map((agent: any) => (
                <AgentStatusCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Analysis Log */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Log Analisi</h3>
          {analyses && analyses.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              ({analyses.length} totali)
            </span>
          )}
        </div>

        {(!analyses || analyses.length === 0) && (
          <div className="rounded-xl card-border-light bg-card p-6 text-center">
            <FileSearch className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Nessuna analisi ancora. Avvia gli agenti per iniziare a scansionare i mercati.
            </p>
          </div>
        )}

        {analyses && analyses.length > 0 && (
          <div className="space-y-2">
            {analyses.map((analysis) => (
              <AnalysisCard key={analysis.id} analysis={analysis} />
            ))}
          </div>
        )}
      </div>

      {/* Trades */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {trades?.length ?? 0} trade{(trades?.length ?? 0) !== 1 ? "" : ""}
          </p>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Filtro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="paper-filled">Paper</SelectItem>
              <SelectItem value="filled">Aperti</SelectItem>
              <SelectItem value="resolved">Chiusi</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {trades && trades.length === 0 && (
          <EmptyState
            icon={TrendingUp}
            message="Nessun trade ancora. Gli agenti Polymarket piazzeranno trade qui."
          />
        )}

        {trades && trades.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {trades.map((trade) => (
              <PolymarketTradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
