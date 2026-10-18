import { writeFileSync } from "node:fs";
import { DEMO_NEWS } from "../src/data/news.ts";

const body = {
  note: "演示消息，对齐样本日线截至 2026-10-09。bias 为正表示利多黄金。",
  items: DEMO_NEWS.map((item) => ({
    id: item.id,
    publishedAt: item.publishedAt,
    source: item.source,
    title: item.title,
    summary: item.summary,
    topic: item.topic,
    bias: item.bias,
    horizon: item.horizon,
  })),
};

const target = new URL("../public/sample-news.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
console.log(`wrote ${body.items.length} headlines to ${target.pathname}`);
