import { Trash2 } from "lucide-react";
import { alertDistance, alertState, alertStateLabel, type PriceAlert } from "../data/alerts.ts";
import { cny } from "../lib/format.ts";
import { Button } from "@/components/ui/button";

function stateTone(state: ReturnType<typeof alertState>): string {
  if (state === "hit") return "text-up";
  if (state === "near") return "text-gold";
  return "text-muted-foreground";
}

export function AlertList({
  alerts,
  price,
  onRemove,
}: {
  alerts: PriceAlert[];
  price: number;
  onRemove?: (id: string) => void;
}) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/15 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
        还没有价位。设一个想买的低点和想卖的高点，它们会画在日线上。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => {
        const state = alertState(alert, price);
        return (
          <li key={alert.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/80 px-3 py-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full text-xs ${
                alert.side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down"
              }`}
            >
              {alert.side === "buy" ? "买" : "卖"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="font-price text-xl tabular-nums">{cny(alert.price)}</span>
                <span className={`text-[11px] ${stateTone(state)}`}>{alertStateLabel(state)}</span>
              </p>
              <p className="truncate text-[12px] text-muted-foreground">
                {alertDistance(alert, price)}
                {alert.note ? ` · ${alert.note}` : ""}
              </p>
            </div>
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground"
                aria-label={`删除${alert.side === "buy" ? "买入" : "卖出"}提醒 ${cny(alert.price)}`}
                onClick={() => onRemove(alert.id)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
