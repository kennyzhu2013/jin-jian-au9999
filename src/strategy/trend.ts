import { cny } from "../lib/format.ts";
import { PARAMS } from "./params.ts";
import type { Frame } from "./frame.ts";
import type { Signal } from "./types.ts";

function signal(frame: Frame, side: Signal["side"], reason: string, riskNote: string): Signal {
  return {
    id: `trend-${frame.date}-${side}`,
    date: frame.date,
    side,
    strategy: "trend",
    regime: frame.regime,
    referencePrice: frame.close,
    reason,
    riskNote,
    fresh: false,
  };
}

export function readTrend(frame: Frame): Signal {
  const crossUp = frame.maFastPrev <= frame.maSlowPrev && frame.maFast > frame.maSlow;
  const crossDown = frame.maFastPrev >= frame.maSlowPrev && frame.maFast < frame.maSlow;
  const breakoutUp = frame.close > frame.priorHigh;
  const breakoutDown = frame.close < frame.priorLow;
  const risk = `趋势单怕假突破。收盘回到 ${PARAMS.fast} 日均线 ${cny(frame.maFast)} 的另一侧，这笔跟踪就失效。`;

  if (frame.regime === "trend_up" && (breakoutUp || crossUp)) {
    const parts: string[] = [];
    if (breakoutUp) parts.push(`收盘突破近 ${PARAMS.donchian} 日高点 ${cny(frame.priorHigh)}`);
    if (crossUp) parts.push(`${PARAMS.fast} 日均线上穿 ${PARAMS.slow} 日均线`);
    return signal(frame, "buy", `${parts.join("，")}。上行趋势里，这是跟随参考，不是补涨保证。`, risk);
  }

  if (frame.regime === "trend_down" && (breakoutDown || crossDown)) {
    const parts: string[] = [];
    if (breakoutDown) parts.push(`收盘跌破近 ${PARAMS.donchian} 日低点 ${cny(frame.priorLow)}`);
    if (crossDown) parts.push(`${PARAMS.fast} 日均线下穿 ${PARAMS.slow} 日均线`);
    return signal(frame, "sell", `${parts.join("，")}。下行趋势里，这是减仓或观望的参考。`, risk);
  }

  if (frame.regime === "range") {
    return signal(
      frame,
      "watch",
      `趋势策略待命。${PARAMS.fast} 日均线 ${cny(frame.maFast)}，${PARAMS.slow} 日均线 ${cny(frame.maSlow)}，效率比 ${frame.efficiency.toFixed(2)} 还不够趋势阈值 ${PARAMS.erTrend.toFixed(2)}。`,
      "震荡里追突破容易来回止损。等效率比升上去，再把决定权交回趋势策略。",
    );
  }

  const bias = frame.regime === "trend_up" ? "上行" : "下行";
  return signal(
    frame,
    "watch",
    `${bias}趋势还在，但今天没有新的突破，也没有均线交叉，所以不重复发信号。`,
    risk,
  );
}
