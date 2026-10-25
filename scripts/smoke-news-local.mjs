#!/usr/bin/env node
/**
 * Offline smoke for /api/news mapping, gold filter, merge, and handler paths.
 * No network. Uses a fake fetch and a non-production key.
 */
import handler, {
  ctimeToIso,
  isGoldRelated,
  itemsFromList,
  mergeNewsItems,
  parseBackfillWords,
  clearNewsCache,
  resolveTianApiKey,
} from "../api/news.js";

const news = Object.assign(handler, {
  ctimeToIso,
  isGoldRelated,
  itemsFromList,
  mergeNewsItems,
  parseBackfillWords,
  clearNewsCache,
  resolveTianApiKey,
});

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const t1 = news.ctimeToIso("2021-02-04 18:00");
const t2 = news.ctimeToIso("2015-07-17");
assert(t1 === "2021-02-04T18:00:00+08:00", "t1 " + t1);
assert(t2 === "2015-07-17T12:00:00+08:00", "t2 " + t2);

assert(news.isGoldRelated("国际金价三季度上涨"), "国际金价");
assert(news.isGoldRelated("黄金储备连增"), "黄金");
assert(news.isGoldRelated("金价回落 油价冲高"), "金价");
assert(news.isGoldRelated("贵金属价格走高"), "贵金属");
assert(news.isGoldRelated("Au99.99 日线"), "Au99.99");
assert(!news.isGoldRelated("金融消费投资维权"), "金融 false friend");
assert(!news.isGoldRelated("住房公积金新政"), "公积金 false friend");
assert(!news.isGoldRelated("权益类基金成立门槛"), "基金 false friend");
assert(!news.isGoldRelated("回购金额超1300亿元"), "金额 false friend");
assert(!news.isGoldRelated("算力金属为何涨"), "金属 false friend");

const filtered = news.itemsFromList(
  [
    { id: "a", title: "金融数据出炉", description: "无关", ctime: "2026-10-19 09:45", source: "日报" },
    { id: "b", title: "国际金价上涨", description: "伦敦金", ctime: "2026-10-10 09:45", source: "日报", url: "https://example.com/b" },
  ],
  true
);
assert(filtered.length === 1 && filtered[0].id === "tian-b", "filter keeps gold only");
assert(filtered[0].url === "https://example.com/b", "url kept");
assert(filtered[0].summary === "伦敦金", "summary");
assert(filtered[0].source === "天行 · 日报", "source");
assert(typeof filtered[0].topic === "string", "topic");
assert(typeof filtered[0].bias === "number", "bias");
assert(typeof filtered[0].horizon === "string", "horizon");

const merged = news.mergeNewsItems(
  [
    { id: "tian-old", publishedAt: "2026-06-05T10:58:00+08:00", title: "old" },
    { id: "tian-dup", publishedAt: "2026-10-08T11:30:00+08:00", title: "first" },
    { id: "tian-new", publishedAt: "2026-10-10T09:45:00+08:00", title: "newer" },
    { id: "tian-dup", publishedAt: "2026-10-08T11:30:00+08:00", title: "dup" },
  ],
  2
);
assert(merged.map((x) => x.id).join(",") === "tian-new,tian-dup", "sort+dedupe+limit " + merged.map((x) => x.id));

assert(news.parseBackfillWords(undefined).length === 0, "no backfill by default");
assert(news.parseBackfillWords("-").length === 0, "dash disables");
assert(news.parseBackfillWords("黄金,金价,国际金价").join(",") === "黄金,金价", "cap two words");

const saved = {
  TIANAPI_KEY: process.env.TIANAPI_KEY,
  TIANAPI_KEY_B64: process.env.TIANAPI_KEY_B64,
  TIANAPI_KEY_XOR: process.env.TIANAPI_KEY_XOR,
  TIANAPI_WORD: process.env.TIANAPI_WORD,
  TIANAPI_NEWS_WORDS: process.env.TIANAPI_NEWS_WORDS,
  TIANAPI_NEWS_PAGES: process.env.TIANAPI_NEWS_PAGES,
  TIANAPI_NEWS_CACHE_SECONDS: process.env.TIANAPI_NEWS_CACHE_SECONDS,
  TIANAPI_NUM: process.env.TIANAPI_NUM,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(saved)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function row(id, title, ctime, description = "") {
  return {
    id,
    title,
    description,
    ctime,
    source: "中国日报财经",
    url: `https://example.com/${id}`,
  };
}

let calls = [];
let page3Attempts = 0;
global.fetch = async (url) => {
  const u = new URL(url);
  calls.push({
    page: u.searchParams.get("page"),
    num: u.searchParams.get("num"),
    word: u.searchParams.get("word"),
    form: u.searchParams.get("form"),
    hasKey: Boolean(u.searchParams.get("key")),
  });
  const page = u.searchParams.get("page");
  const word = u.searchParams.get("word");
  if (word === "黄金") {
    return {
      json: async () => ({
        code: 200,
        result: {
          list: [
            row("gold-oct8", "黄金储备连增", "2026-10-08 11:30"),
            row("gold-jun", "黄金已成储备资产", "2026-06-05 10:58"),
          ],
        },
      }),
    };
  }
  if (page === "2") {
    return { json: async () => { throw new Error("boom"); } };
  }
  if (page === "3") {
    page3Attempts += 1;
    if (page3Attempts === 1) {
      return { json: async () => ({ code: 130, msg: "频率超限" }) };
    }
    return {
      json: async () => ({
        code: 200,
        result: {
          list: [row("sep", "多国从美国运回黄金", "2026-09-04 09:50")],
        },
      }),
    };
  }
  if (page === "4") {
    return {
      json: async () => ({
        code: 200,
        result: {
          list: [row("aug", "多路资金买入黄金", "2026-08-11 09:44", "现货金")],
        },
      }),
    };
  }
  return {
    json: async () => ({
      code: 200,
      result: {
        list: [
          row("finance", "金融数据出炉", "2026-10-19 09:45", "无关"),
          row("oct10", "国际金价三季度上涨", "2026-10-10 09:45", "高波动"),
          row("oct8", "黄金储备连增", "2026-10-08 11:30", "深意"),
        ],
      },
    }),
  };
};

async function invoke(query, method = "GET") {
  calls = [];
  page3Attempts = 0;
  news.clearNewsCache();
  const res = mockRes();
  await news({ method, query: query || {} }, res);
  return res;
}

delete process.env.TIANAPI_KEY;
delete process.env.TIANAPI_KEY_B64;
delete process.env.TIANAPI_KEY_XOR;
delete process.env.TIANAPI_WORD;
delete process.env.TIANAPI_NEWS_WORDS;
delete process.env.TIANAPI_NEWS_PAGES;
process.env.TIANAPI_NEWS_CACHE_SECONDS = "0";

const missing = await invoke({});
assert(missing.statusCode === 502, "missing key status");
assert(missing.body.error === "TIANAPI_KEY is not configured", "missing key error");

process.env.TIANAPI_KEY = "unit-test-key";

const multi = await invoke({ num: "10" });
assert(multi.statusCode === 200, "multi status " + multi.statusCode);
assert(Array.isArray(multi.body.items), "items array");
assert(
  multi.body.items.map((x) => x.id).join(",") === "tian-oct10,tian-oct8,tian-sep,tian-aug",
  "fresh order " + multi.body.items.map((x) => x.id)
);
assert(!multi.body.items.some((x) => x.id === "tian-finance"), "dropped 金融");
assert(calls.filter((c) => c.page === "3").length === 2, "page 3 retried after 130");
assert(calls.every((c) => c.word == null && c.form === "1" && c.hasKey && c.num === "50"), "chrono query shape");
assert(new Set(calls.map((c) => c.page)).size === 4, "pages " + calls.map((c) => c.page));
assert(String(multi.body.note).includes("部分上游失败"), "partial note " + multi.body.note);
assert(multi.headers["Cache-Control"].includes("max-age=60"), "partial cache");
const item = multi.body.items[0];
for (const field of ["id", "publishedAt", "source", "title", "summary", "topic", "bias", "horizon", "url"]) {
  assert(item[field] != null, "field " + field);
}

const legacy = await invoke({ word: "黄金", num: "10" });
assert(legacy.statusCode === 200, "legacy status");
assert(legacy.body.note === "天行财经 · word=黄金", "legacy note");
assert(calls.length === 1 && calls[0].word === "黄金" && calls[0].num === "10", "legacy one call");
assert(legacy.body.items[0].id === "tian-gold-oct8", "legacy keeps upstream order");
assert(legacy.body.items[1].publishedAt.startsWith("2026-06-05"), "legacy second is older");

process.env.TIANAPI_NEWS_WORDS = "黄金";
const backfill = await invoke({ num: "10", pages: "1" });
assert(backfill.statusCode === 200, "backfill status");
assert(calls.length === 2, "page + word calls " + calls.length);
assert(calls[1].word === "黄金", "backfill word");
assert(backfill.body.items[0].id === "tian-oct10", "backfill still sorts fresh first");
assert(backfill.body.items.some((x) => x.id === "tian-gold-jun"), "backfill keeps older keyword hit");
assert(!backfill.body.items.some((x) => x.title.includes("金融")), "backfill still filters");
delete process.env.TIANAPI_NEWS_WORDS;

global.fetch = async () => {
  throw new Error("network down");
};
const allFail = await invoke({});
assert(allFail.statusCode === 502, "all fail status");
assert(String(allFail.body.error).includes("network down"), "all fail error " + allFail.body.error);
assert(!allFail.body.items, "all fail has no items");

const opt = await invoke({}, "OPTIONS");
assert(opt.statusCode === 204 && opt.ended, "options");

delete process.env.TIANAPI_KEY;
process.env.TIANAPI_KEY_XOR = (() => {
  const plain = "unit-test-key";
  const PAD = "jinjian-au9999-tianapi-pad-v1!!";
  const buf = Buffer.from(plain, "utf8");
  const pb = Buffer.from(PAD.repeat(Math.ceil(buf.length / PAD.length)).slice(0, buf.length), "utf8");
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ pb[i];
  return out.toString("hex");
})();
assert(news.resolveTianApiKey() === "unit-test-key", "xor key roundtrip");

restoreEnv();
news.clearNewsCache();
console.log("smoke-news-local ok", t1, t2);
