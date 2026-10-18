import { cny, cnMonthDay, unsignedPct } from "../lib/format.ts";
import { PARAMS, REGIME_LABEL, SIDE_LABEL, STRATEGY_LABEL } from "../strategy/params.ts";
import type { Analysis } from "../strategy/types.ts";
import type { Signal } from "../strategy/types.ts";

function Reading({ title, signal, active }: { title: string; signal: Signal; active: boolean }) {
  return (
    <article className={`panel ${active ? "" : "opacity-80"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="kicker">{title}</p>
        <span className="text-[11px] text-muted-foreground">{active ? "生效" : "待命"}</span>
      </div>
      <h2 className="mt-2 text-xl">
        {STRATEGY_LABEL[signal.strategy]} · {SIDE_LABEL[signal.side]}
      </h2>
      <p className="mt-2 text-sm leading-relaxed">{signal.reason}</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{signal.riskNote}</p>
    </article>
  );
}

export function SignalsPage({ analysis }: { analysis: Analysis }) {
  const history = [...analysis.history].reverse().slice(0, 8);
  const marker = Math.min(analysis.regime.efficiency, 1) * 100;

  return (
    <div className="space-y-4">
      <header>
        <p className="kicker">状态切换</p>
        <h1 className="font-price mt-2 text-3xl">趋势或震荡，只让一边做主</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          近 {PARAMS.erLookback} 日效率比看方向干不干净。干净就跟踪均线和突破，来回抽打就在区间边缘高抛低吸。
        </p>
      </header>
      <section className="panel">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="kicker">当前状态</p>
            <p className="mt-1 text-2xl">{REGIME_LABEL[analysis.regime.kind]}</p>
          </div>
          <p className="font-price text-3xl tabular-nums">{analysis.regime.efficiency.toFixed(2)}</p>
        </div>
        <div className="relative mt-4 h-2 rounded-full bg-white/10">
          <span className="absolute inset-y-[-3px] w-px bg-white/40" style={{ left: "30%" }} />
          <span className="absolute inset-y-[-3px] w-px bg-gold" style={{ left: "38%" }} />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-soft"
            style={{ left: `${marker}%` }}
          />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          0.30 以下视为震荡，0.38 以上才进入趋势，中间沿用上一状态。{analysis.regime.reason}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gold-soft">{analysis.regime.backdrop}</p>
      </section>
      <Reading title="正在执行" signal={analysis.today} active />
      <Reading title="另一边" signal={analysis.standby} active={false} />
      {analysis.levels && (
        <section className="panel">
          <p className="kicker">此刻的价位尺</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[11px] text-muted-foreground">10 / 30 日均线</dt>
              <dd className="mt-1 tabular-nums">
                {cny(analysis.levels.maFast)} / {cny(analysis.levels.maSlow)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">近 20 日高 / 低</dt>
              <dd className="mt-1 tabular-nums">
                {cny(analysis.levels.priorHigh)} / {cny(analysis.levels.priorLow)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">布林上下轨</dt>
              <dd className="mt-1 tabular-nums">
                {cny(analysis.levels.upper)} / {cny(analysis.levels.lower)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">区间分位</dt>
              <dd className="mt-1 tabular-nums">{unsignedPct(analysis.levels.rangePos)}</dd>
            </div>
          </dl>
        </section>
      )}
      <section className="panel">
        <p className="kicker">参数</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">效率比窗口</dt>
            <dd>{PARAMS.erLookback} 日</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">趋势 / 震荡阈值</dt>
            <dd>
              {PARAMS.erTrend.toFixed(2)} / {PARAMS.erRange.toFixed(2)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">快慢均线</dt>
            <dd>
              {PARAMS.fast} / {PARAMS.slow}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">突破与区间</dt>
            <dd>{PARAMS.donchian} 日</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">布林带</dt>
            <dd>
              {PARAMS.band} 日 · {PARAMS.bandMult} 倍标准差
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">低吸 / 高抛分位</dt>
            <dd>
              {unsignedPct(PARAMS.rangeBuyPos)} / {unsignedPct(PARAMS.rangeSellPos)}
            </dd>
          </div>
        </dl>
      </section>
      <section className="space-y-2">
        <h2 className="px-1 text-base font-medium">最近触发</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有可执行的买卖。</p>
        ) : (
          <ul className="space-y-2">
            {history.map((item) => (
              <li key={item.id} className="rounded-2xl border border-white/10 bg-card/80 px-3 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm">
                    {cnMonthDay(item.date)} · {STRATEGY_LABEL[item.strategy]}
                  </p>
                  <p className={item.side === "buy" ? "text-sm text-up" : "text-sm text-down"}>
                    {SIDE_LABEL[item.side]} {cny(item.referencePrice)}
                  </p>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{item.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
