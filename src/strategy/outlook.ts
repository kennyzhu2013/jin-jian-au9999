import { selectNews, type NewsItem } from "../data/news.ts";
import { cny, unsignedPct } from "../lib/format.ts";
import type { Analysis } from "./types.ts";

export type AdviceAction = "buy" | "hold" | "reduce" | "sell";

export type AdviceCall = {
  horizon: "short" | "medium";
  horizonLabel: "短线" | "中线";
  action: AdviceAction;
  label: string;
  score: number;
  conviction: "low" | "medium" | "high";
  convictionLabel: string;
};

export type OutlookReason = {
  kind: "price" | "news";
  text: string;
};

export type Outlook = {
  asOf: string;
  ready: boolean;
  short: AdviceCall;
  medium: AdviceCall;
  technicalTactical: number;
  technicalBackdrop: number;
  newsShort: number;
  newsMedium: number;
  reasons: OutlookReason[];
  headlines: NewsItem[];
  disclaimer: string;
  newsNote: string;
};

const ACTION_LABEL: Record<AdviceAction, string> = {
  buy: "买入",
  hold: "持有",
  reduce: "减仓",
  sell: "卖出",
};

const CONVICTION_LABEL = {
  low: "低",
  medium: "中",
  high: "高",
} as const;

function clamp(value: number): number {
  return Math.max(-2, Math.min(2, value));
}

function actionOf(score: number): AdviceAction {
  if (score >= 0.85) return "buy";
  if (score <= -1.15) return "sell";
  if (score <= -0.4) return "reduce";
  return "hold";
}

function convictionOf(score: number, technical: number, news: number, volatility: number): AdviceCall["conviction"] {
  const agree = technical === 0 || news === 0 || Math.sign(technical) === Math.sign(news);
  let level: AdviceCall["conviction"] = "low";
  if (Math.abs(score) >= 0.9 && agree) level = "high";
  else if (Math.abs(score) >= 0.45) level = "medium";
  if (volatility >= 0.055 && level === "high") return "medium";
  if (volatility >= 0.07 && level === "medium") return "low";
  return level;
}

function newsScore(items: NewsItem[], horizon: "short" | "medium"): number {
  let weighted = 0;
  let weight = 0;
  for (const item of items) {
    const match = item.horizon === "both" || item.horizon === horizon ? 1 : 0.35;
    weighted += item.bias * match;
    weight += match;
  }
  if (weight === 0) return 0;
  return clamp(weighted / weight);
}

function call(horizon: "short" | "medium", score: number, technical: number, news: number, volatility: number): AdviceCall {
  const conviction = convictionOf(score, technical, news, volatility);
  return {
    horizon,
    horizonLabel: horizon === "short" ? "短线" : "中线",
    action: actionOf(score),
    label: ACTION_LABEL[actionOf(score)],
    score,
    conviction,
    convictionLabel: CONVICTION_LABEL[conviction],
  };
}

export function buildOutlook(analysis: Analysis, news: NewsItem[], asOf: string, newsMode: "demo" | "http" | "cached" = "demo"): Outlook {
  const relevant = selectNews(news, asOf);
  const levels = analysis.levels;
  const close = analysis.today.referencePrice;
  let tactical = 0;
  let backdrop = 0;
  if (analysis.ready && levels && close > 0) {
    if (analysis.regime.kind === "trend_up") tactical = 1.4;
    else if (analysis.regime.kind === "trend_down") tactical = -1.4;
    else if (levels.rangePos <= 0.18) tactical = 1.05;
    else if (levels.rangePos >= 0.82) tactical = -1.05;
    else tactical = (0.5 - levels.rangePos) * 0.9;

    if ((analysis.today.fresh || analysis.zoneStillOpen) && analysis.today.side === "buy") tactical += 0.35;
    if ((analysis.today.fresh || analysis.zoneStillOpen) && analysis.today.side === "sell") tactical -= 0.35;

    backdrop += close < levels.maSlow ? -0.85 : 0.85;
    backdrop += levels.maFast < levels.maSlow ? -0.45 : 0.45;
    if (analysis.regime.kind === "trend_down") backdrop -= 0.25;
    if (analysis.regime.kind === "trend_up") backdrop += 0.25;
  }
  tactical = clamp(tactical);
  backdrop = clamp(backdrop);

  const newsShort = newsScore(relevant, "short");
  const newsMedium = newsScore(relevant, "medium");
  const volatility = levels?.atrBandWidth ?? 0;
  const shortScore = clamp(tactical * 0.72 + newsShort * 0.28);
  const mediumScore = clamp(backdrop * 0.5 + newsMedium * 0.5);

  const reasons: OutlookReason[] = [];
  if (analysis.ready && levels) {
    reasons.push({
      kind: "price",
      text: `技术状态是${analysis.regime.label}，今日${analysis.today.strategy === "range" ? "高抛低吸" : "趋势跟踪"}为${analysis.today.side === "buy" ? "买入" : analysis.today.side === "sell" ? "卖出" : "观望"}。`,
    });
    reasons.push({
      kind: "price",
      text: `收盘 ${cny(close)}，10 日均线 ${cny(levels.maFast)}，30 日均线 ${cny(levels.maSlow)}。`,
    });
    reasons.push({
      kind: "price",
      text: `近 20 日支撑 ${cny(levels.rangeLow)}，压力 ${cny(levels.rangeHigh)}，分位 ${unsignedPct(levels.rangePos)}。`,
    });
  } else {
    reasons.push({ kind: "price", text: "日线样本还不够，价格结构先按中性处理。" });
  }

  const ranked = [...relevant].sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias)).slice(0, 3);
  if (ranked.length === 0) {
    reasons.push({ kind: "news", text: "最近 21 天没有可用消息，建议只参考价格结构。" });
  } else {
    for (const item of ranked) {
      const tilt = item.bias > 0.2 ? "利多黄金" : item.bias < -0.2 ? "利空黄金" : "影响中性";
      reasons.push({ kind: "news", text: `${item.title}。${tilt}。` });
    }
  }

  const newsNote =
    newsMode === "demo"
      ? "消息是对齐到最近一根日线的演示语料。"
      : newsMode === "cached"
        ? "消息是上次成功拉到的缓存。"
        : "消息来自自定义接口。";

  return {
    asOf,
    ready: analysis.ready,
    short: call("short", shortScore, tactical, newsShort, volatility),
    medium: call("medium", mediumScore, backdrop, newsMedium, volatility),
    technicalTactical: tactical,
    technicalBackdrop: backdrop,
    newsShort,
    newsMedium,
    reasons,
    headlines: ranked,
    disclaimer: "建议由日线结构和消息规则合成，只供个人复盘，不是投资建议，也不会下单。",
    newsNote,
  };
}
