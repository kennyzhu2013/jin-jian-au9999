import { cny } from "../lib/format.ts";
import { PARAMS, REGIME_LABEL } from "./params.ts";
import type { Frame } from "./frame.ts";
import type { RegimeSnapshot } from "./types.ts";

export function describeRegime(frame: Frame): RegimeSnapshot {
  const efficiency = frame.efficiency.toFixed(2);
  let reason = `近 ${PARAMS.erLookback} 个交易日效率比 ${efficiency}。`;
  if (frame.efficiency <= PARAMS.erRange) {
    reason += `低于 ${PARAMS.erRange.toFixed(2)}，涨跌互相抵消，按震荡处理。`;
  } else if (frame.efficiency >= PARAMS.erTrend) {
    reason += `达到 ${PARAMS.erTrend.toFixed(2)}，方向比较干净，按趋势处理。`;
  } else {
    reason += `落在 ${PARAMS.erRange.toFixed(2)} 和 ${PARAMS.erTrend.toFixed(2)} 之间，沿用上一状态，避免来回切换。`;
  }

  let backdrop = "短均线和 30 日均线还没有拧到同一边。";
  if (frame.close < frame.maSlow && frame.maFast <= frame.maSlow) {
    backdrop = `收盘在 30 日均线 ${cny(frame.maSlow)} 下方，中期背景偏弱。`;
  } else if (frame.close > frame.maSlow && frame.maFast >= frame.maSlow) {
    backdrop = `收盘在 30 日均线 ${cny(frame.maSlow)} 上方，中期背景偏强。`;
  }

  return {
    kind: frame.regime,
    label: REGIME_LABEL[frame.regime],
    efficiency: frame.efficiency,
    reason,
    backdrop,
  };
}
