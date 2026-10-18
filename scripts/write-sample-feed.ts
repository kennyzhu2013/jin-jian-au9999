import { writeFileSync } from "node:fs";
import { demoMarket, PUBLISHED_RANGE } from "../src/data/demoSeries.ts";

const market = demoMarket();
const body = {
  symbol: "Au99.99",
  currency: "CNY",
  unit: "克",
  note: `${PUBLISHED_RANGE.start} 至 ${PUBLISHED_RANGE.end} 为公开日线摘录，更早日期为演示补齐。`,
  quote: {
    price: market.quote.price,
    open: market.quote.open,
    high: market.quote.high,
    low: market.quote.low,
    prevClose: market.quote.prevClose,
    time: market.quote.time,
  },
  bars: market.bars.map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    ...(bar.volume != null ? { volume: bar.volume } : {}),
    source: bar.source,
  })),
};

const target = new URL("../public/sample-feed.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
console.log(`wrote ${market.bars.length} bars to ${target.pathname}`);
