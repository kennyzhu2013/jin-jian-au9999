import type { Bar, MarketSnapshot, Quote } from "./types.ts";
import { round2 } from "../lib/format.ts";

/**
 * 2026-09-09 至 2026-10-09 的 OHLC 摘自公开的上海黄金交易所 Au99.99 日线表。
 * 更早的交易日用固定种子补齐，只为让均线有足够样本，界面会标明「演示补齐」。
 * 10 月 9 日之后没有继续编造，避免把休市或未核对的日子写成成交。
 */
const PUBLISHED: Bar[] = [
  { date: "2026-09-09", open: 950, high: 952.8, low: 941, close: 951.77, volume: 5370.9, source: "published" },
  { date: "2026-09-10", open: 952, high: 957, low: 945.51, close: 952.99, volume: 4446.3, source: "published" },
  { date: "2026-09-11", open: 946.5, high: 952, low: 929, close: 939.54, volume: 7187.08, source: "published" },
  { date: "2026-09-14", open: 938.88, high: 950, low: 932.8, close: 932.8, volume: 6128.64, source: "published" },
  { date: "2026-09-15", open: 956, high: 956, low: 920, close: 928.17, volume: 6890.52, source: "published" },
  { date: "2026-09-16", open: 925, high: 938.59, low: 924.5, close: 936.75, volume: 5054.54, source: "published" },
  { date: "2026-09-17", open: 937.5, high: 964, low: 924, close: 934.81, volume: 6143.82, source: "published" },
  { date: "2026-09-18", open: 937, high: 948.9, low: 935.5, close: 947.09, volume: 5219.06, source: "published" },
  { date: "2026-09-21", open: 944.5, high: 947.69, low: 937.5, close: 938.09, volume: 7106.98, source: "published" },
  { date: "2026-09-22", open: 941.5, high: 951.5, low: 930, close: 931.98, volume: 6875.66, source: "published" },
  { date: "2026-09-23", open: 932, high: 940, low: 932, close: 934, volume: 4696.64, source: "published" },
  { date: "2026-09-24", open: 932, high: 935.78, low: 924.1, close: 926.01, volume: 5373.74, source: "published" },
  { date: "2026-09-28", open: 915.1, high: 918, low: 899, close: 900.89, volume: 8733.26, source: "published" },
  { date: "2026-09-29", open: 903, high: 903, low: 890, close: 897.53, volume: 11306.7, source: "published" },
  { date: "2026-09-30", open: 899, high: 909, low: 897.5, close: 907.32, volume: 6722.32, source: "published" },
  { date: "2026-10-08", open: 890.5, high: 896.3, low: 889, close: 892, volume: 14411.92, source: "published" },
  { date: "2026-10-09", open: 892, high: 909, low: 888, close: 904.48, volume: 8690.32, source: "published" },
];

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

function synthesizeEarly(): Bar[] {
  const days = businessDays("2026-05-06", "2026-09-08");
  const rand = mulberry32(20261009);
  const raw: number[] = [];
  let price = 768;
  for (let index = 0; index < days.length; index += 1) {
    price += 0.62 + (rand() - 0.46) * 3.1;
    raw.push(price);
  }
  const target = 948.4;
  const lastRaw = raw.at(-1) ?? target;
  const gap = target - lastRaw;
  const closes = raw.map((value, index) => round2(value + gap * (index / Math.max(raw.length - 1, 1))));

  return days.map((date, index) => {
    const close = closes[index] ?? target;
    const prev = index === 0 ? close - 0.8 : (closes[index - 1] ?? close);
    const open = round2(prev + (rand() - 0.5) * 1.5);
    const wick = 1.1 + rand() * 2.2;
    const high = round2(Math.max(open, close) + wick * (0.35 + rand()));
    const low = round2(Math.min(open, close) - wick * (0.35 + rand()));
    return { date, open, high, low, close, source: "synthetic" as const };
  });
}

export function buildDemoBars(): Bar[] {
  const bars = [...synthesizeEarly(), ...PUBLISHED];
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
  start: PUBLISHED[0]?.date ?? "",
  end: PUBLISHED.at(-1)?.date ?? "",
};
