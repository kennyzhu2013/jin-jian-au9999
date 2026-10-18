import { cnMonthDay } from "../lib/format.ts";
import { TOPIC_LABEL } from "../data/news.ts";
import type { AdviceCall, Outlook } from "../strategy/outlook.ts";

function tone(action: AdviceCall["action"]): string {
  if (action === "buy") return "text-up";
  if (action === "sell" || action === "reduce") return "text-down";
  return "text-gold";
}

function CallBlock({ call }: { call: AdviceCall }) {
  return (
    <div className="rounded-xl bg-black/30 px-3 py-3">
      <p className="text-[11px] tracking-[0.14em] text-muted-foreground">{call.horizonLabel}</p>
      <p className={`font-price mt-1 text-[2.6rem] leading-none ${tone(call.action)}`}>{call.label}</p>
      <p className="mt-2 text-[12px] text-gold-soft">把握 {call.convictionLabel}</p>
    </div>
  );
}

export function OutlookCard({ outlook }: { outlook: Outlook }) {
  return (
    <section className="panel ring-1 ring-gold/30" aria-label="综合建议">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">综合建议</p>
          <p className="mt-1 text-[12px] text-muted-foreground">技术状态加上消息偏向，不取代下面的规则信号。</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <CallBlock call={outlook.short} />
        <CallBlock call={outlook.medium} />
      </div>
      <ul className="mt-4 space-y-2">
        {outlook.reasons.map((reason) => (
          <li key={`${reason.kind}-${reason.text}`} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-0.5 shrink-0 text-[11px] tracking-[0.12em] text-gold">
              {reason.kind === "price" ? "价格" : "消息"}
            </span>
            <span>{reason.text}</span>
          </li>
        ))}
      </ul>
      {outlook.headlines.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-white/10 pt-3">
          {outlook.headlines.map((item) => (
            <li key={item.id}>
              <p className="text-[11px] text-muted-foreground">
                {cnMonthDay(item.publishedAt.slice(0, 10))} · {TOPIC_LABEL[item.topic]} · {item.source}
              </p>
              <p className="text-sm leading-relaxed">{item.title}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {outlook.newsNote}
        {outlook.disclaimer}
      </p>
    </section>
  );
}
