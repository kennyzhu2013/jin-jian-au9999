import { writeFileSync } from "node:fs";
import { demoMarket, PUBLISHED_RANGE } from "../src/data/demoSeries.ts";

const market = demoMarket();
const body = {
  symbol: "Au99.99",
  currency: "CNY",
  unit: "克",
  note: `日线为每日开高低收（浙商积存金口径演示）。${PUBLISHED_RANGE.start} 至 ${PUBLISHED_RANGE.end} 为近期样本，更早为演示补齐；实时价由京东积存金覆盖。`,
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
console.log(`wrote ${market.bars.length} bars to ${target.pathname}; maxHigh(last48)=${Math.max(...market.bars.slice(-48).map((b) => b.high))}`);
