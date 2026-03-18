import { TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Badge } from "./ui/badge";
import type { PolymarketTrade } from "../api/polymarket";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PolymarketTradeCard({ trade }: { trade: PolymarketTrade }) {
  const { data } = trade;
  const isWin = data.pnl > 0;
  const isOpen = trade.status === "filled" || trade.status === "paper-filled";
  const isPaper = data.paperTrade;

  return (
    <div className="group block rounded-2xl card-border-light bg-card overflow-hidden transition-all duration-200 hover:shadow-lg">
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug flex-1">
            {data.marketQuestion || trade.title || "Unknown market"}
          </p>
          <Badge
            className={
              data.outcome === "YES"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-red-500/20 text-red-400 border-red-500/30"
            }
          >
            {data.outcome}
          </Badge>
        </div>

        {/* Trade details */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Side</span>
            <div className="font-medium mt-0.5 flex items-center gap-1">
              {data.side === "BUY" ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-400" />
              )}
              {data.side}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Price</span>
            <div className="font-medium mt-0.5">${data.price?.toFixed(2) ?? "—"}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Size</span>
            <div className="font-medium mt-0.5">${data.size?.toFixed(2) ?? "—"}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <div className="flex items-center gap-2">
            {isPaper && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">
                PAPER
              </Badge>
            )}
            {isOpen ? (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                <Clock className="h-2.5 w-2.5" />
                OPEN
              </Badge>
            ) : (
              <Badge
                className={
                  isWin
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]"
                    : "bg-red-500/20 text-red-400 border-red-500/30 text-[10px]"
                }
              >
                {isWin ? `+$${data.pnl.toFixed(2)}` : `-$${Math.abs(data.pnl).toFixed(2)}`}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {formatDate(data.placedAt || trade.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
