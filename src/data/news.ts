export type NewsTopic = "fed" | "usd" | "geopolitics" | "china" | "sge" | "other";
export type NewsHorizon = "short" | "medium" | "both";

export type NewsItem = {
  id: string;
  publishedAt: string;
  source: string;
  title: string;
  summary: string;
  topic: NewsTopic;
  /** 正数利多黄金，负数利空黄金，范围大约 -2 到 2。 */
  bias: number;
  horizon: NewsHorizon;
  scoredBy: "given" | "keyword";
};

const BULLISH: ReadonlyArray<readonly [string, number]> = [
  ["降息", 1.1],
  ["鸽派", 0.9],
  ["避险", 1],
  ["地缘", 0.8],
  ["冲突", 0.7],
  ["购金", 0.7],
  ["黄金储备", 0.6],
  ["美元走弱", 1],
  ["美元下跌", 1],
];

const BEARISH: ReadonlyArray<readonly [string, number]> = [
  ["加息", -1.1],
  ["鹰派", -0.9],
  ["限制性利率", -1.1],
  ["美元走强", -1],
  ["美元指数走高", -0.8],
  ["实际利率", -0.7],
  ["金饰需求", -0.6],
  ["溢价收窄", -0.4],
  ["减持黄金", -1],
];

export function keywordBias(text: string): number {
  let score = 0;
  let hits = 0;
  for (const [phrase, weight] of [...BULLISH, ...BEARISH]) {
    if (text.includes(phrase)) {
      score += weight;
      hits += 1;
    }
  }
  if (hits === 0) return 0;
  return clamp(score / hits, -1.6, 1.6);
}

export function clamp(value: number, lo = -2, hi = 2): number {
  return Math.max(lo, Math.min(hi, value));
}

/** 演示语料，日期对齐到样本日线的 2026-10-09，不是实时通讯社。 */
export const DEMO_NEWS: NewsItem[] = [
  {
    id: "fed-minutes-20261008",
    publishedAt: "2026-10-08T21:00:00+08:00",
    source: "演示 · 宏观",
    title: "美联储纪要：限制性利率还要维持一段时间",
    summary: "多数官员认为现在谈降息还早，实际利率维持在高位。",
    topic: "fed",
    bias: -1.3,
    horizon: "medium",
    scoredBy: "given",
  },
  {
    id: "usd-firm-20261007",
    publishedAt: "2026-10-07T18:30:00+08:00",
    source: "演示 · 外汇",
    title: "美元指数走强，黄金的持有成本上升",
    summary: "美元连续收高，以美元计价的黄金短线承压。",
    topic: "usd",
    bias: -1,
    horizon: "both",
    scoredBy: "given",
  },
  {
    id: "geo-haven-20261003",
    publishedAt: "2026-10-03T09:20:00+08:00",
    source: "演示 · 地缘",
    title: "地缘紧张升级，避险买盘托住金价",
    summary: "冲突抬头后，黄金 ETF 出现申购，下跌被一部分买盘接住。",
    topic: "geopolitics",
    bias: 1.2,
    horizon: "short",
    scoredBy: "given",
  },
  {
    id: "sge-volume-20260930",
    publishedAt: "2026-09-30T16:10:00+08:00",
    source: "演示 · 上金所",
    title: "上金所 Au99.99 下跌日成交放大",
    summary: "价格回落时成交量上升，国内短线买盘有承接，但均线还没有转头。",
    topic: "sge",
    bias: 0.55,
    horizon: "short",
    scoredBy: "given",
  },
  {
    id: "pboc-20260928",
    publishedAt: "2026-09-28T17:00:00+08:00",
    source: "演示 · 中国",
    title: "官方黄金储备继续增加，单月增幅放缓",
    summary: "购金还在，速度比前几个月慢，中线有底，但冲劲有限。",
    topic: "china",
    bias: 0.35,
    horizon: "medium",
    scoredBy: "given",
  },
  {
    id: "jewelry-20260922",
    publishedAt: "2026-09-22T11:00:00+08:00",
    source: "演示 · 中国",
    title: "金饰需求转淡，品牌金溢价收窄",
    summary: "高价遇上季节性淡季，国内首饰消费意愿下降。",
    topic: "china",
    bias: -0.75,
    horizon: "medium",
    scoredBy: "given",
  },
  {
    id: "fed-speak-20260918",
    publishedAt: "2026-09-18T22:40:00+08:00",
    source: "演示 · 宏观",
    title: "美联储官员重申抗通胀优先",
    summary: "讲话偏鹰，市场下调了年内降息次数的预期。",
    topic: "fed",
    bias: -0.9,
    horizon: "medium",
    scoredBy: "given",
  },
];

const TOPIC_SET = new Set<NewsTopic>(["fed", "usd", "geopolitics", "china", "sge", "other"]);
const HORIZON_SET = new Set<NewsHorizon>(["short", "medium", "both"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNews(payload: unknown): NewsItem[] {
  const record = asRecord(payload);
  const rows = Array.isArray(payload) ? payload : record && Array.isArray(record.items) ? record.items : null;
  if (!rows) throw new Error("消息接口需要 items 数组，或直接返回数组。");
  const items: NewsItem[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) continue;
    const title = asText(item.title);
    const publishedAt = asText(item.publishedAt ?? item.date ?? item.time);
    if (!title || !publishedAt) continue;
    const summary = asText(item.summary ?? item.description);
    const given = typeof item.bias === "number" && Number.isFinite(item.bias) ? item.bias : null;
    const topicValue = asText(item.topic);
    const horizonValue = asText(item.horizon);
    items.push({
      id: asText(item.id) || `${publishedAt}-${title.slice(0, 12)}`,
      publishedAt,
      source: asText(item.source) || "自定义接口",
      title,
      summary,
      topic: TOPIC_SET.has(topicValue as NewsTopic) ? (topicValue as NewsTopic) : "other",
      bias: clamp(given ?? keywordBias(`${title} ${summary}`)),
      horizon: HORIZON_SET.has(horizonValue as NewsHorizon) ? (horizonValue as NewsHorizon) : "both",
      scoredBy: given == null ? "keyword" : "given",
    });
  }
  if (items.length === 0) throw new Error("消息接口里没有可用的标题。");
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function selectNews(items: NewsItem[], asOf: string, lookbackDays = 21): NewsItem[] {
  return items.filter((item) => {
    const day = item.publishedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return false;
    if (day > asOf) return false;
    const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
    return age >= 0 && age <= lookbackDays;
  });
}

export const TOPIC_LABEL: Record<NewsTopic, string> = {
  fed: "美联储",
  usd: "美元",
  geopolitics: "地缘",
  china: "中国",
  sge: "上金所",
  other: "其他",
};
