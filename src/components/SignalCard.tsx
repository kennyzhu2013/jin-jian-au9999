import { cny, cnMonthDay } from "../lib/format.ts";
import { SIDE_LABEL, STRATEGY_LABEL } from "../strategy/params.ts";
import type { Signal } from "../strategy/types.ts";

function tone(side: Signal["side"]): string {
  if (side === "buy") return "border-up/40 bg-up/10 text-up";
  if (side === "sell") return "border-down/40 bg-down/10 text-down";
  return "border-gold/30 bg-gold/10 text-gold";
}

export function SignalCard({
  eyebrow,
  signal,
  note,
}: {
  eyebrow: string;
  signal: Signal;
  note?: string;
}) {
  return (
    <article className="panel">
      <div className="flex items-center justify-between gap-3">
        <p className="kicker">{eyebrow}</p>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${tone(signal.side)}`}>
          {SIDE_LABEL[signal.side]}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">参考价 · {cnMonthDay(signal.date)}收盘</p>
          <p className="font-price mt-1 text-4xl leading-none tabular-nums">{cny(signal.referencePrice)}</p>
        </div>
        <p className="mb-1 text-right text-xs text-muted-foreground">
          {STRATEGY_LABEL[signal.strategy]}
          <br />
          元/克
        </p>
      </div>
      {note && <p className="mt-3 text-sm leading-relaxed text-gold-soft">{note}</p>}
      <p className="mt-3 text-sm leading-relaxed text-foreground">{signal.reason}</p>
      <div className="mt-3 rounded-xl bg-black/25 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">风险</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{signal.riskNote}</p>
      </div>
    </article>
  );
}
