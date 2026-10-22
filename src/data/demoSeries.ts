import type { Bar, MarketSnapshot, Quote } from "./types.ts";
import { round2 } from "../lib/format.ts";

/**
 * 日线目标口径：浙商积存金(京东) 元/克，不是上金所 Au99.99。
 * 历史 K 线为按现价附近补齐的演示日 OHLC（每根 = 一个交易日开高低收），
 * 供均线/策略有足够样本；实时价由 /api/jd-quote 覆盖。
 * 最近约 60 个交易日刻意压在 ~860–915，避免旧 Au99.99 摘录把 Y 轴拉到 ~970。
 */
const ANCHOR_END = "2026-10-21";
const ANCHOR_CLOSE = 888.45;

const HOLIDAYS = new Set([
  "2026-05-01",
  "2026-05-04",
  "2026-05-05",
  "2026-06-19",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
]);

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function businessDays(start: string, end: string): string[] {
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if (!isWeekend(cursor) && !HOLIDAYS.has(cursor)) days.push(cursor);
  }
  return days;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 形状：缓升 → 八月中高点 ~910 → 九月回落 → 十月落在 880–910。 */
function shapeClose(index: number, total: number, rand: () => number): number {
  const t = total <= 1 ? 1 : index / (total - 1);
  let base: number;
  if (t < 0.45) {
    base = 805 + (t / 0.45) * 85;
  } else if (t < 0.72) {
    const u = (t - 0.45) / 0.27;
    base = 890 + Math.sin(u * Math.PI) * 18;
  } else {
    const u = (t - 0.72) / 0.28;
    base = 905 - u * 20;
  }
  return base + (rand() - 0.5) * 4.2;
}

function synthesizeJdBars(): Bar[] {
  const days = businessDays("2026-05-06", ANCHOR_END);
  const rand = mulberry32(20261022);
  const raw = days.map((_, index) => shapeClose(index, days.length, rand));
  const lastRaw = raw.at(-1) ?? ANCHOR_CLOSE;
  const gap = ANCHOR_CLOSE - lastRaw;
  const closes = raw.map((value, index) =>
    round2(value + gap * (index / Math.max(raw.length - 1, 1))),
  );

  return days.map((date, index) => {
    const close = closes[index] ?? ANCHOR_CLOSE;
    const prev = index === 0 ? close - 0.6 : (closes[index - 1] ?? close);
    const open = round2(prev + (rand() - 0.5) * 1.2);
    const wick = 0.8 + rand() * 1.8;
    let high = round2(Math.max(open, close) + wick * (0.25 + rand() * 0.7));
    let low = round2(Math.min(open, close) - wick * (0.25 + rand() * 0.7));
    // 最近约 60 根硬顶，避免演示噪声顶破 915
    const nearEnd = index >= days.length - 60;
    if (nearEnd) {
      high = round2(Math.min(high, 914.5));
      low = round2(Math.max(low, 868));
      if (low > Math.min(open, close)) low = round2(Math.min(open, close) - 0.4);
      if (high < Math.max(open, close)) high = round2(Math.max(open, close) + 0.4);
    }
    const late = index >= days.length - 20;
    return {
      date,
      open,
      high,
      low,
      close,
      source: late ? ("published" as const) : ("synthetic" as const),
    };
  });
}

export function buildDemoBars(): Bar[] {
  const bars = synthesizeJdBars();
  for (let index = 1; index < bars.length; index += 1) {
    const prev = bars[index - 1];
    const current = bars[index];
    if (!prev || !current || current.date <= prev.date) {
      throw new Error("演示日线日期没有按顺序排好");
    }
  }
  return bars;
}

export function quoteFromBars(bars: Bar[], sourceLabel: string): Quote {
  const last = bars.at(-1);
  const prev = bars.at(-2);
  if (!last || !prev) throw new Error("日线至少需要两根");
  return {
    symbol: "Au99.99",
    price: last.close,
    open: last.open,
    high: last.high,
    low: last.low,
    prevClose: prev.close,
    time: `${last.date}T15:30:00+08:00`,
    sourceLabel,
  };
}

export function demoMarket(now = new Date()): MarketSnapshot {
  const bars = buildDemoBars();
  return {
    symbol: "Au99.99",
    bars,
    quote: quoteFromBars(bars, "演示行情"),
    fetchedAt: now.toISOString(),
    mode: "demo",
  };
}

export const PUBLISHED_RANGE = {
  start: buildDemoBars().find((bar) => bar.source === "published")?.date ?? ANCHOR_END,
  end: ANCHOR_END,
};
