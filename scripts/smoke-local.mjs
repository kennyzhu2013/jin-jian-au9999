#!/usr/bin/env node
/**
 * Offline smoke test: 京东积存金 datas → feed quote + today bar.
 * No network. Optional live pull: node scripts/smoke-local.mjs --live
 */

import {
  JD_PRODUCT_SKU,
  SOURCE_LABEL,
  barFromQuote,
  buildQuoteResponse,
  fetchJdQuote,
  mapJdDatasToQuote,
  parseJdQuotePayload,
} from "../lib/jd-quote.mjs";

const EPOCH_MS = Date.UTC(2026, 9, 19, 3, 2, 1); // 2026-10-19 11:02:01+08:00

const SAMPLE_JD = {
  success: true,
  resultCode: 0,
  resultMsg: "成功",
  channelEncrypt: 0,
  resultData: {
    status: "SUCCESS",
    datas: {
      productSku: JD_PRODUCT_SKU,
      demode: false,
      price: "862.41",
      yesterdayPrice: "871.97",
      upAndDownAmt: "-9.56",
      upAndDownRate: "-1.10%",
      time: String(EPOCH_MS),
      id: 46381761,
    },
  },
};

function fail(message, extra) {
  console.error(`FAIL: ${message}`);
  if (extra !== undefined) console.error(extra);
  process.exit(1);
}

const datas = parseJdQuotePayload(SAMPLE_JD);
if (!datas) fail("parseJdQuotePayload returned null");

const quote = mapJdDatasToQuote(datas);
const expectedQuote = {
  price: 862.41,
  open: 871.97,
  high: 871.97,
  low: 862.41,
  prevClose: 871.97,
  time: "2026-10-19T11:02:01+08:00",
  sourceLabel: SOURCE_LABEL,
};
if (JSON.stringify(quote) !== JSON.stringify(expectedQuote)) {
  fail("quote mapping mismatch", {
    got: quote,
    expected: expectedQuote,
  });
}

const bar = barFromQuote(quote);
const expectedBar = {
  date: "2026-10-19",
  open: 871.97,
  high: 871.97,
  low: 862.41,
  close: 862.41,
  source: "live",
};
if (JSON.stringify(bar) !== JSON.stringify(expectedBar)) {
  fail("bar mapping mismatch", { got: bar, expected: expectedBar });
}

const body = buildQuoteResponse(datas);
if (!body || body.sourceLabel !== SOURCE_LABEL || body.productSku !== JD_PRODUCT_SKU) {
  fail("buildQuoteResponse missing sourceLabel or productSku", body);
}
if (body.symbol !== "Au99.99" || body.currency !== "CNY" || body.unit !== "克") {
  fail("feed keys changed", body);
}
if (!Array.isArray(body.bars) || body.bars.length !== 1) {
  fail("expected a single today bar", body && body.bars);
}

if (parseJdQuotePayload({ success: false, resultData: { datas: { price: "1" } } })) {
  fail("success:false should not parse");
}
if (parseJdQuotePayload({ success: true, resultData: { status: "SUCCESS", datas: {} } })) {
  fail("missing price should not parse");
}

const priceOnly = mapJdDatasToQuote({ price: 900, time: EPOCH_MS }, EPOCH_MS);
if (
  !priceOnly ||
  priceOnly.open !== 900 ||
  priceOnly.high !== 900 ||
  priceOnly.low !== 900 ||
  priceOnly.prevClose !== 900
) {
  fail("missing yesterdayPrice should fall back to price", priceOnly);
}

console.log("Mapped 浙商积存金(京东) quote:");
console.log(JSON.stringify(body, null, 2));
console.log("");
console.log(
  "Quote: price←datas.price, prevClose/open←yesterdayPrice, high/low←max/min(price, yesterdayPrice); time epoch → ISO+08:00; sourceLabel←浙商积存金(京东)"
);
console.log("Bars: one today bar {date,open,high,low,close,source:'live'} from that quote. No 极速 / 上金所.");
const down = await fetchJdQuote(async () => {
  throw new Error("down");
});
if (down.ok || down.httpOk || !String(down.error).includes("down")) {
  fail("fetch failure should surface", down);
}

const httpFail = await fetchJdQuote(async () => ({
  ok: false,
  status: 503,
  text: async () => "{\"success\":false}",
}));
if (httpFail.httpOk || httpFail.ok || httpFail.text !== "{\"success\":false}") {
  fail("HTTP error should keep upstream text and not count as ok", httpFail);
}

const emptyPrice = await fetchJdQuote(async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ success: false, resultMsg: "no" }),
}));
if (!emptyPrice.httpOk || emptyPrice.ok || emptyPrice.body) {
  fail("HTTP 200 without a price stays raw-only", emptyPrice);
}

console.log("OK: matches expected JD quote mapping");

if (process.argv.includes("--live")) {
  const live = await fetchJdQuote();
  if (!live.ok || !live.body) fail(live.error || "live pull failed", live.text && live.text.slice(0, 300));
  const q = live.body.quote;
  if (!(q.price > 0) || q.sourceLabel !== SOURCE_LABEL) fail("live quote missing price or sourceLabel", q);
  if (String(live.body.productSku) !== JD_PRODUCT_SKU) fail("live productSku mismatch", live.body.productSku);
  console.log("");
  console.log("LIVE OK:", JSON.stringify({
    sourceLabel: live.body.sourceLabel,
    productSku: live.body.productSku,
    price: q.price,
    prevClose: q.prevClose,
    open: q.open,
    high: q.high,
    low: q.low,
    time: q.time,
    barDate: live.body.bars[0] && live.body.bars[0].date,
  }));
}
