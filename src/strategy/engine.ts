import type { Bar } from "../data/types.ts";
import { buildFrame, stickRegime, type Frame } from "./frame.ts";
import { describeRegime } from "./regime.ts";
import { readRange } from "./range.ts";
import { readTrend } from "./trend.ts";
import type { Analysis, Levels, Signal } from "./types.ts";

function levelsOf(frame: Frame): Levels {
  return {
    maFast: frame.maFast,
    maSlow: frame.maSlow,
    upper: frame.upperBand,
    lower: frame.lowerBand,
    mid: frame.midBand,
    priorHigh: frame.priorHigh,
    priorLow: frame.priorLow,
    rangeHigh: frame.rangeHigh,
    rangeLow: frame.rangeLow,
    rangePos: frame.rangePos,
    atrBandWidth: frame.bandWidth,
  };
}

function emptySignal(date: string): Signal {
  return {
    id: `warmup-${date}`,
    date,
    side: "watch",
    strategy: "trend",
    regime: "range",
    referencePrice: 0,
    reason: "日线还不够长，均线和效率比还算不出来。",
    riskNote: "样本不足时不要凭这页做决定。",
    fresh: false,
  };
}

function notReady(bars: Bar[]): Analysis {
  const last = bars.at(-1);
  const date = last?.date ?? "";
  return {
    ready: false,
    regime: {
      kind: "range",
      label: "样本不足",
      efficiency: 0,
      reason: "至少需要 30 根日线才能区分趋势和震荡。",
      backdrop: "先把行情补齐。",
    },
    today: emptySignal(date),
    standby: emptySignal(date),
    latestTrade: null,
    zoneStillOpen: false,
    history: [],
    levels: null,
  };
}

export function analyze(bars: Bar[]): Analysis {
  const frames: Frame[] = [];
  let previous: Frame["regime"] | null = null;
  for (let index = 0; index < bars.length; index += 1) {
    const frame = buildFrame(bars, index);
    if (!frame) continue;
    frame.regime = stickRegime(frame, previous);
    previous = frame.regime;
    frames.push(frame);
  }
  if (frames.length < 2) return notReady(bars);

  const history: Signal[] = [];
  let prevTrend: Signal["side"] = "watch";
  let prevRange: Signal["side"] = "watch";

  for (const frame of frames) {
    const trend = readTrend(frame);
    const range = readRange(frame);
    if (frame.regime !== "range" && (trend.side === "buy" || trend.side === "sell") && trend.side !== prevTrend) {
      history.push({ ...trend, fresh: true });
    }
    if (frame.regime === "range" && (range.side === "buy" || range.side === "sell") && range.side !== prevRange) {
      history.push({ ...range, fresh: true });
    }
    prevTrend = frame.regime === "range" ? "watch" : trend.side;
    prevRange = frame.regime === "range" ? range.side : "watch";
  }

  const last = frames.at(-1);
  if (!last) return notReady(bars);
  const trendNow = readTrend(last);
  const rangeNow = readRange(last);
  const today = last.regime === "range" ? rangeNow : trendNow;
  const standby = last.regime === "range" ? trendNow : rangeNow;
  const latestTrade = history.at(-1) ?? null;
  const fresh =
    latestTrade != null &&
    latestTrade.date === today.date &&
    latestTrade.strategy === today.strategy &&
    latestTrade.side === today.side;
  const zoneStillOpen =
    !fresh &&
    latestTrade != null &&
    latestTrade.strategy === today.strategy &&
    latestTrade.side === today.side &&
    today.side !== "watch";

  return {
    ready: true,
    regime: describeRegime(last),
    today: { ...today, fresh },
    standby: { ...standby, fresh: false },
    latestTrade,
    zoneStillOpen,
    history,
    levels: levelsOf(last),
  };
}
