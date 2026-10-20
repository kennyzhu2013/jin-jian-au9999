import { useState } from "react";
import { cny, clockLabel, signedNumber, signedPct } from "../lib/format.ts";
import { sessionKind, sessionLabel } from "../lib/session.ts";
import type { Quote } from "../data/types.ts";

export function PriceHero({ quote, now }: { quote: Quote; now?: Date }) {
  const [openedAt] = useState(() => new Date());
  const clock = now ?? openedAt;
  const change = quote.price - quote.prevClose;
  const changePct = quote.prevClose === 0 ? 0 : change / quote.prevClose;
  const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-muted-foreground";
  const session = sessionLabel(sessionKind(clock));

  return (
    <section className="panel relative overflow-hidden" aria-live="polite">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <p className="kicker">{quote.sourceLabel === "浙商积存金(京东)" ? "浙商积存金(京东) · 非官方接口" : "Au9999 · 上金所 Au99.99"}</p>
        <p className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-gold-soft">{session}</p>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="font-price text-[3.4rem] leading-none tracking-tight text-foreground tabular-nums">
          {cny(quote.price)}
        </p>
        <p className="mb-1 text-sm text-muted-foreground">元/克</p>
      </div>
      <p className={`mt-3 text-sm font-medium tabular-nums ${tone}`}>
        较前收 {signedNumber(change)} · {signedPct(changePct)}
        <span className="ml-2 font-normal text-muted-foreground">前收 {cny(quote.prevClose)}</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">开盘</dt>
          <dd className="mt-1 tabular-nums">{cny(quote.open)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">最高</dt>
          <dd className="mt-1 text-up tabular-nums">{cny(quote.high)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">最低</dt>
          <dd className="mt-1 text-down tabular-nums">{cny(quote.low)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {quote.sourceLabel} · 最近成交 {clockLabel(quote.time)} · 红涨绿跌
      </p>
    </section>
  );
}
