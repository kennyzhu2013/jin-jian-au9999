import type { Digest } from "../strategy/digest.ts";

export function DigestView({ digest, compact = false }: { digest: Digest; compact?: boolean }) {
  return (
    <article className="panel">
      <p className="kicker">{digest.kicker}</p>
      <h2 className="font-price mt-2 text-3xl leading-tight">{digest.title}</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">{digest.dateline}</p>
      <p className="mt-4 text-base leading-relaxed text-foreground">{digest.lede}</p>
      {!compact && (
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-white/10 py-3 text-sm">
          {digest.stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 space-y-4">
        {(compact ? digest.sections.slice(0, 2) : digest.sections).map((section) => (
          <section key={section.heading}>
            <h3 className="text-sm font-medium text-gold-soft">{section.heading}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
