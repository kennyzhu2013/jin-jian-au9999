import { DEFAULT_ENDPOINT, type Settings } from "../data/storage.ts";
import type { MarketSnapshot } from "../data/types.ts";
import { clockLabel, cnDate } from "./format.ts";

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/** 站内示例行情。走 HTTP 拉它时，数据仍是公开摘录加演示补齐。 */
export function isSampleQuoteEndpoint(endpoint: string): boolean {
  const trimmed = endpoint.trim();
  if (!trimmed || trimmed === DEFAULT_ENDPOINT) return true;
  const path = trimmed.startsWith("/") ? trimmed.split("?")[0] ?? trimmed : pathnameOf(trimmed);
  return path === "/sample-feed.json" || path.endsWith("/sample-feed.json");
}

function pathnameOf(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

/**
 * 自定义行情已接通，且当前画面上的日线不是演示样本。
 * 演示模式，或仍指向 /sample-feed.json，保持原文案。
 */
export function customQuoteConnected(settings: Settings, snapshot: MarketSnapshot): boolean {
  const fromCustomFeed =
    snapshot.mode === "http" || (snapshot.mode === "cached" && (snapshot.quote.sourceLabel === "自定义接口" || snapshot.quote.sourceLabel === "浙商积存金(京东)"));
  if (!fromCustomFeed) return false;
  if (snapshot.quote.sourceLabel === "演示行情") return false;
  return !(settings.source === "http" && isSampleQuoteEndpoint(settings.endpoint));
}

/** 设置里已填自定义行情地址，但画面可能还没换成接口数据。 */
export function customQuoteConfigured(settings: Settings): boolean {
  return settings.source === "http" && !isSampleQuoteEndpoint(settings.endpoint);
}

export function customQuoteCaption(snapshot: MarketSnapshot): string {
  let start = "";
  let end = "";
  for (const bar of snapshot.bars) {
    if (!DATE_PREFIX.test(bar.date)) continue;
    if (!start || bar.date < start) start = bar.date;
    if (!end || bar.date > end) end = bar.date;
  }
  const updated = clockLabel(snapshot.quote.time || snapshot.fetchedAt);
  const jd = snapshot.quote.sourceLabel === "浙商积存金(京东)";
  const live = jd ? `实时价为浙商积存金(京东)，非 Au9999 现货；该接口为非官方，可能变更或限流，失败时回退自定义接口报价。更新于 ${updated}。` : `实时价更新于 ${updated}。`;
  if (!start || !end) return jd ? `日线来自自定义接口。${live}` : `日线与实时价来自自定义接口。${live}`;
  const span = start === end ? cnDate(start) : `${cnDate(start)} 至 ${cnDate(end)}`;
  return `日线来自自定义接口（上金所 Au99.99），覆盖 ${span}。${live}`;
}

export const CUSTOM_CHART_NOTE = "点一根 K 线看当日价。日线来自自定义接口，实时价优先取浙商积存金(京东)。买卖虚线是你设的价位。";
export const DEMO_CHART_NOTE = "点一根 K 线看当日价。颜色较淡的是演示补齐，实色是公开摘录。买卖虚线是你设的价位。";
