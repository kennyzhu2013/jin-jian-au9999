import type { Bar } from "../data/types.ts";
import { bollinger, efficiencyRatio, extreme, sma } from "./indicators.ts";
import { PARAMS } from "./params.ts";
import type { RegimeKind } from "./types.ts";

export type Frame = {
  index: number;
  date: string;
  close: number;
  regime: RegimeKind;
  efficiency: number;
  maFast: number;
  maSlow: number;
  maFastPrev: number;
  maSlowPrev: number;
  slope: number;
  upperBand: number;
  lowerBand: number;
  midBand: number;
  bandWidth: number;
  priorHigh: number;
  priorLow: number;
  rangeHigh: number;
  rangeLow: number;
  rangePos: number;
};

export function buildFrame(bars: Bar[], index: number): Frame | null {
  const closes = bars.map((bar) => bar.close);
  const bar = bars[index];
  if (!bar) return null;

  const maFast = sma(closes, index, PARAMS.fast);
  const maSlow = sma(closes, index, PARAMS.slow);
  const maFastPrev = sma(closes, index - 1, PARAMS.fast);
  const maSlowPrev = sma(closes, index - 1, PARAMS.slow);
  const maFastSlopeBase = sma(closes, index - PARAMS.slopeLookback, PARAMS.fast);
  const efficiency = efficiencyRatio(closes, index, PARAMS.erLookback);
  const bands = bollinger(closes, index, PARAMS.band, PARAMS.bandMult);
  const priorHigh = extreme(bars, index - 1, PARAMS.donchian, "high");
  const priorLow = extreme(bars, index - 1, PARAMS.donchian, "low");
  const rangeHigh = extreme(bars, index, PARAMS.donchian, "high");
  const rangeLow = extreme(bars, index, PARAMS.donchian, "low");

  if (
    maFast == null ||
    maSlow == null ||
    maFastPrev == null ||
    maSlowPrev == null ||
    maFastSlopeBase == null ||
    efficiency == null ||
    bands == null ||
    priorHigh == null ||
    priorLow == null ||
    rangeHigh == null ||
    rangeLow == null ||
    maFastSlopeBase === 0
  ) {
    return null;
  }

  const span = rangeHigh - rangeLow;
  return {
    index,
    date: bar.date,
    close: bar.close,
    regime: "range",
    efficiency,
    maFast,
    maSlow,
    maFastPrev,
    maSlowPrev,
    slope: (maFast - maFastSlopeBase) / maFastSlopeBase,
    upperBand: bands.upper,
    lowerBand: bands.lower,
    midBand: bands.mid,
    bandWidth: bands.width,
    priorHigh,
    priorLow,
    rangeHigh,
    rangeLow,
    rangePos: span === 0 ? 0.5 : (bar.close - rangeLow) / span,
  };
}

/**
 * 效率比高于趋势阈值才进入趋势；低于震荡阈值才回到震荡。
 * 中间地带沿用上一状态，避免行情在门槛附近来回换策略。
 */
export function stickRegime(frame: Frame, previous: RegimeKind | null): RegimeKind {
  const down =
    frame.efficiency >= PARAMS.erTrend &&
    frame.close < frame.maSlow &&
    (frame.maFast <= frame.maSlow || frame.slope < 0);
  const up =
    frame.efficiency >= PARAMS.erTrend &&
    frame.close > frame.maSlow &&
    (frame.maFast >= frame.maSlow || frame.slope > 0);

  if (down) return "trend_down";
  if (up) return "trend_up";
  if (frame.efficiency <= PARAMS.erRange) return "range";
  if (previous === "trend_up" || previous === "trend_down") return previous;
  return "range";
}
