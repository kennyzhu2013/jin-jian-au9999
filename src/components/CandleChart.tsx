import { useMemo, useState } from "react";
import type { PriceAlert } from "../data/alerts.ts";
import type { Bar } from "../data/types.ts";
import { cny, cnMonthDay, sourceLabel } from "../lib/format.ts";
import { sma } from "../strategy/indicators.ts";
import { PARAMS } from "../strategy/params.ts";

const VIEW = 48;

export function CandleChart({ bars, alerts }: { bars: Bar[]; alerts: PriceAlert[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked != null && picked < bars.length ? picked : Math.max(bars.length - 1, 0);

  const model = useMemo(() => {
    const closes = bars.map((bar) => bar.close);
    const fast = closes.map((_, index) => sma(closes, index, PARAMS.fast));
    const slow = closes.map((_, index) => sma(closes, index, PARAMS.slow));
    const start = Math.max(0, bars.length - VIEW);
    const view = bars.slice(start);
    const lows = view.map((bar) => bar.low);
    const highs = view.map((bar) => bar.high);
    let min = Math.min(...lows);
    let max = Math.max(...highs);
    const mid = (min + max) / 2;
    for (const alert of alerts) {
      if (alert.price > mid * 0.94 && alert.price < mid * 1.08) {
        min = Math.min(min, alert.price);
        max = Math.max(max, alert.price);
      }
    }
    const pad = (max - min) * 0.08 || 1;
    return { start, view, fast, slow, min: min - pad, max: max + pad };
  }, [alerts, bars]);

  const width = 360;
  const height = 196;
  const left = 8;
  const right = 52;
  const top = 12;
  const bottom = 8;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const slot = plotW / Math.max(model.view.length, 1);

  const yOf = (price: number) => top + ((model.max - price) / (model.max - model.min)) * plotH;
  const active = bars[selected] ?? bars.at(-1);
  const ticks = [model.max, (model.max + model.min) / 2, model.min];

  const line = (series: (number | null)[], color: string) => {
    const points: string[] = [];
    for (let index = 0; index < model.view.length; index += 1) {
      const value = series[model.start + index];
      if (value == null) continue;
      const x = left + slot * index + slot / 2;
      points.push(`${x.toFixed(1)},${yOf(value).toFixed(1)}`);
    }
    if (points.length < 2) return null;
    return <polyline key={color} fill="none" stroke={color} strokeWidth="1.4" points={points.join(" ")} />;
  };

  return (
    <section className="panel" aria-label="日线走势">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="kicker">日线</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="text-[#f0d7a2]">10 日</span>
          <span className="mx-1">·</span>
          <span className="text-[#8eb4c8]">30 日</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="rgb(243 236 223 / 10%)"
            />
            <text x={width - right + 6} y={yOf(tick) + 3} fill="#b3a79a" fontSize="9">
              {cny(tick, 0)}
            </text>
          </g>
        ))}
        {alerts.map((alert) => {
          if (alert.price < model.min || alert.price > model.max) return null;
          const y = yOf(alert.price);
          const color = alert.side === "buy" ? "#ff4d4f" : "#1fad74";
          return (
            <g key={alert.id}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke={color}
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text x={left + 2} y={y - 3} fill={color} fontSize="9">
                {alert.side === "buy" ? "买" : "卖"} {cny(alert.price, 0)}
              </text>
            </g>
          );
        })}
        {model.view.map((bar, index) => {
          const x = left + slot * index + slot / 2;
          const up = bar.close >= bar.open;
          const color = up ? "#ff4d4f" : "#1fad74";
          const bodyTop = yOf(Math.max(bar.open, bar.close));
          const bodyBottom = yOf(Math.min(bar.open, bar.close));
          const bodyH = Math.max(bodyBottom - bodyTop, 1);
          const candleW = Math.max(slot * 0.58, 2);
          const globalIndex = model.start + index;
          return (
            <g key={bar.date} opacity={bar.source === "synthetic" ? 0.72 : 1} onClick={() => setPicked(globalIndex)}>
              <line x1={x} x2={x} y1={yOf(bar.high)} y2={yOf(bar.low)} stroke={color} strokeWidth="1" />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
                rx="0.6"
                stroke={globalIndex === selected ? "#f3ddb0" : "none"}
                strokeWidth="1"
              />
              <rect
                x={left + slot * index}
                y={top}
                width={slot}
                height={plotH}
                fill="transparent"
              />
            </g>
          );
        })}
        {line(model.slow, "#8eb4c8")}
        {line(model.fast, "#f0d7a2")}
      </svg>
      {active && (
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">{cnMonthDay(active.date)}</span>
          <span className="mx-1">·</span>
          {sourceLabel(active.source)}
          <span className="mx-1">·</span>
          开 {cny(active.open)} 高 {cny(active.high)} 低 {cny(active.low)} 收 {cny(active.close)}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        点一根 K 线看当日价。颜色较淡的是演示补齐，实色是公开摘录。买卖虚线是你设的价位。
      </p>
    </section>
  );
}
