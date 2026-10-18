import { cnMonthDay } from "../lib/format.ts";
import { SIDE_LABEL, STRATEGY_LABEL } from "./params.ts";
import type { Analysis, Signal } from "./types.ts";

export type Headline = {
  eyebrow: string;
  signal: Signal;
  note: string;
};

export function signalHeadline(analysis: Analysis): Headline {
  if (analysis.today.fresh && analysis.today.side !== "watch") {
    return {
      eyebrow: "今日触发",
      signal: analysis.today,
      note: analysis.regime.backdrop,
    };
  }

  if (analysis.zoneStillOpen && analysis.latestTrade) {
    return {
      eyebrow: "信号仍有效",
      signal: analysis.latestTrade,
      note: `${cnMonthDay(analysis.latestTrade.date)}触发后，同一条件还在，所以不再重复提醒。`,
    };
  }

  if (analysis.latestTrade) {
    const switched = analysis.latestTrade.strategy !== analysis.today.strategy;
    return {
      eyebrow: "最近一笔买卖",
      signal: analysis.latestTrade,
      note: switched
        ? `这笔是${STRATEGY_LABEL[analysis.latestTrade.strategy]}的${SIDE_LABEL[analysis.latestTrade.side]}。状态已经切到${analysis.regime.label}，当前${STRATEGY_LABEL[analysis.today.strategy]}：${SIDE_LABEL[analysis.today.side]}。`
        : analysis.today.reason,
    };
  }

  return {
    eyebrow: "当前策略",
    signal: analysis.today,
    note: analysis.today.riskNote,
  };
}
