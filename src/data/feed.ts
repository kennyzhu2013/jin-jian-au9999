import { demoMarket, quoteFromBars } from "./demoSeries.ts";
import type { Bar, BarSource, MarketSnapshot, Quote } from "./types.ts";
import type { Settings } from "./storage.ts";
import { round2 } from "../lib/format.ts";

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Loose;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function asSource(value: unknown): BarSource {
  if (value === "published" || value === "synthetic" || value === "live") return value;
  return "live";
}

export function endpointError(endpoint: string): string | null {
  const trimmed = endpoint.trim();
  if (!trimmed) return "先填接口地址。";
  if (trimmed.startsWith("/")) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" || url.protocol === "http:") return null;
  } catch {
    return "地址需要是 /sample-feed.json 这种站内路径，或 http(s) 链接。";
  }
  return "地址需要是 /sample-feed.json 这种站内路径，或 http(s) 链接。";
}

function parseBars(value: unknown): Bar[] {
  if (!Array.isArray(value)) return [];
  const bars: Bar[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const date = asDate(row.date ?? row.time);
    const open = asNumber(row.open);
    const high = asNumber(row.high);
    const low = asNumber(row.low);
    const close = asNumber(row.close ?? row.price);
    if (!date || open == null || high == null || low == null || close == null) continue;
    const volume = asNumber(row.volume);
    bars.push({
      date,
      open: round2(open),
      high: round2(Math.max(high, open, close)),
      low: round2(Math.min(low, open, close)),
      close: round2(close),
      ...(volume != null ? { volume } : {}),
      source: asSource(row.source),
    });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars.filter((bar, index) => index === 0 || bar.date !== bars[index - 1]?.date);
}

function readQuote(payload: Loose, bars: Bar[]): Quote | null {
  const box = asRecord(payload.quote) ?? payload;
  const price = asNumber(box.price ?? box.close);
  if (price == null && bars.length === 0) return null;
  const last = bars.at(-1);
  const prev = bars.at(-2);
  const resolved = price ?? last?.close;
  if (resolved == null || !last) return null;
  const timeValue = box.time;
  const time = typeof timeValue === "string" && timeValue.trim() ? timeValue : `${last.date}T15:30:00+08:00`;
  return {
    symbol: "Au99.99",
    price: round2(resolved),
    open: round2(asNumber(box.open) ?? last.open),
    high: round2(asNumber(box.high) ?? Math.max(last.high, resolved)),
    low: round2(asNumber(box.low) ?? Math.min(last.low, resolved)),
    prevClose: round2(asNumber(box.prevClose ?? box.previousClose) ?? prev?.close ?? last.open),
    time,
    sourceLabel: "自定义接口",
  };
}

function applyQuote(bars: Bar[], quote: Quote): Bar[] {
  const date = asDate(quote.time) ?? bars.at(-1)?.date;
  if (!date) return bars;
  const next = bars.map((bar) => ({ ...bar }));
  const last = next.at(-1);
  if (last && last.date === date) {
    last.close = quote.price;
    last.high = round2(Math.max(last.high, quote.high, quote.price));
    last.low = round2(Math.min(last.low, quote.low, quote.price));
    last.open = quote.open;
    return next;
  }
  if (!last || date > last.date) {
    next.push({
      date,
      open: quote.open,
      high: Math.max(quote.high, quote.price),
      low: Math.min(quote.low, quote.price),
      close: quote.price,
      source: "live",
    });
  }
  return next;
}

export function normalizeFeed(payload: unknown, sourceLabel: string): MarketSnapshot {
  const record = asRecord(payload);
  if (!record) throw new Error("接口没有返回 JSON 对象。");
  let bars = parseBars(record.bars);
  if (bars.length < 40) {
    const base = demoMarket().bars.filter((bar) => !bars.some((item) => item.date === bar.date));
    bars = [...base, ...bars].sort((a, b) => a.date.localeCompare(b.date));
  }
  const quote = readQuote(record, bars);
  if (!quote) {
    throw new Error("需要 quote.price，或一组含 date、open、high、low、close 的 bars。");
  }
  const merged = applyQuote(bars, quote);
  const aligned = quoteFromBars(merged, sourceLabel);
  return {
    symbol: "Au99.99",
    bars: merged,
    quote: {
      ...aligned,
      time: quote.time || aligned.time,
      sourceLabel,
    },
    fetchedAt: new Date().toISOString(),
    mode: "http",
  };
}

export async function loadMarket(settings: Settings): Promise<MarketSnapshot> {
  if (settings.source === "demo") return demoMarket();
  const problem = endpointError(settings.endpoint);
  if (problem) throw new Error(problem);
  const response = await fetch(settings.endpoint.trim(), { cache: "no-store" });
  if (!response.ok) throw new Error(`接口返回 ${response.status}，没能更新行情。`);
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("接口没有返回 JSON。请确认这个地址直接给出行情数据。");
  }
  return normalizeFeed(payload, "自定义接口");
}
