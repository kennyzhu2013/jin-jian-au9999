"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");

const ENV_ID = "testgold-d6g8l28m85a3d21aa";
const SNAPSHOT_ID = "default";
const JD_URL = "https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=1961543816";
const NEWS_URL = "https://testgold-d6g8l28m85a3d21aa-1512175549.ap-shanghai.app.tcloudbase.com/api/news";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function headersFor(event) {
  const headers = Object.assign({}, JSON_HEADERS);
  const h = (event && event.headers) || {};
  const origin = String(h.origin || h.Origin || "").trim();
  // file:// / omitted Origin: gateway will not reflect ACAO — set *
  if (!origin || origin === "null") headers["Access-Control-Allow-Origin"] = "*";
  return headers;
}
const seedFeed = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-feed.json"), "utf8"));
const seedNews = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-news.json"), "utf8"));

/** 旧种子混入了上金所 Au99.99 高点(~964)，与积存金现价(~880–910)不一致时整表换新种子。 */
function feedNeedsJdRescale(feed) {
  const bars = (feed && feed.bars) || [];
  if (!bars.length) return true;
  const window = bars.slice(-60);
  let maxH = 0;
  for (const b of window) {
    const h = Number(b && b.high);
    if (Number.isFinite(h) && h > maxH) maxH = h;
  }
  return maxH >= 920;
}

function pickBaseFeed(existingFeed) {
  if (!existingFeed || feedNeedsJdRescale(existingFeed)) {
    return JSON.parse(JSON.stringify(seedFeed));
  }
  return existingFeed;
}

function isHttpTrigger(event) {
  if (!event || typeof event !== "object") return false;
  return Boolean(event.httpMethod || event.requestContext || event.path || event.headers || typeof event.body === "string");
}
function isTimerTrigger(event) {
  if (!event || typeof event !== "object") return false;
  if (event.Type === "Timer" || event.triggerType === "timer") return true;
  const tn = String(event.TriggerName || event.triggerName || "");
  if (tn && /refresh|every-5m|timer/i.test(tn)) return true;
  return false;
}
function requestPath(event) {
  return String((event && (event.path || (event.requestContext && event.requestContext.path))) || "");
}
function parseBody(event) {
  if (!event) return {};
  if (event.body && typeof event.body === "object") return event.body;
  if (typeof event.body === "string" && event.body.trim()) {
    try { return JSON.parse(event.body); } catch { return {}; }
  }
  return {};
}
function truthy(v) {
  if (v === true || v === 1) return true;
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
function wantsNewsRefresh(event, p) {
  // Timer never refreshes news
  if (isTimerTrigger(event)) return false;
  const q = (event && (event.queryStringParameters || event.query || {})) || {};
  const body = parseBody(event);
  if (truthy(q.refreshNews) || truthy(body.refreshNews) || truthy(event.refreshNews)) return true;
  // /api/last-snapshot/refresh → both (quote + news)
  if (/last-snapshot\/refresh/.test(p)) return true;
  // path containing last-news with refresh
  if ((/last-news/.test(p) || /\/news\/?$/.test(p)) && /refresh/.test(p)) return true;
  if ((/last-news/.test(p) || (event && event.kind === "news")) && (truthy(q.refresh) || truthy(body.refresh) || event.refresh === true)) return true;
  return false;
}
function wantsQuoteRefresh(event, p) {
  if (isTimerTrigger(event)) return true;
  if (event && event.refresh === true) return true;
  const q = (event && (event.queryStringParameters || event.query || {})) || {};
  const body = parseBody(event);
  if (truthy(q.refresh) || truthy(body.refresh)) return true;
  if (/refresh/.test(p)) return true;
  return false;
}
function httpResponse(statusCode, payload, event) {
  return { statusCode, headers: headersFor(event), body: typeof payload === "string" ? payload : JSON.stringify(payload), isBase64Encoded: false };
}
function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, data) { return crypto.createHmac("sha256", key).update(data, "utf8").digest(); }
function sqlStr(obj) { return JSON.stringify(obj).replace(/'/g, "''"); }
function errDetail(error) {
  const out = { message: String(error && error.message ? error.message : error) };
  if (error && error.cause) {
    out.cause = {
      message: String(error.cause.message || error.cause),
      code: error.cause.code || undefined,
      errno: error.cause.errno || undefined,
      syscall: error.cause.syscall || undefined,
      hostname: error.cause.hostname || undefined,
    };
  }
  if (error && error.code) out.code = error.code;
  return out;
}

async function callTcb(action, payload) {
  const secretId = process.env.TENCENTCLOUD_SECRETID;
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY;
  const token = process.env.TENCENTCLOUD_SESSIONTOKEN || "";
  if (!secretId || !secretKey) throw new Error("missing SCF temp credentials");
  const host = "tcb.tencentcloudapi.com";
  const service = "tcb";
  const region = "ap-shanghai";
  const version = "2018-06-08";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(Object.assign({ EnvId: ENV_ID }, payload));
  const hashedRequestPayload = sha256hex(body);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256hex(canonicalRequest)}`;
  const secretDate = hmac("TC3" + secretKey, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = crypto.createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": action,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": version,
    "X-TC-Region": region,
  };
  if (token) headers["X-TC-Token"] = token;
  const text = await new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, method: "POST", path: "/", headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(new Error("tcb https timeout")); });
    req.write(body);
    req.end();
  });
  const json = JSON.parse(text);
  if (json.Response && json.Response.Error) throw new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`);
  return json.Response || json;
}
async function executeSql(sql) { return callTcb("ExecutePGSql", { Sql: sql }); }

function toIso8(ms) {
  const n = Number(ms);
  const t = Number.isFinite(n) && n > 0 ? n : Date.now();
  return new Date(t + 8 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "+08:00");
}
function round2(n) { return Math.round(Number(n) * 100) / 100; }

/** 把京东积存金最新价落成「当日」日 K，并纠正 quote 的开高低（不再沿用 Au99.99 种子 OHLC）。 */
function buildFeedFromQuote(datas, baseFeed) {
  const feed = JSON.parse(JSON.stringify(baseFeed || seedFeed));
  const price = Number(datas && datas.price);
  const prev = Number(datas && datas.yesterdayPrice);
  const time = toIso8(datas && datas.time);
  const day = String(time).slice(0, 10);
  const px = Number.isFinite(price) && price > 0 ? price : Number(feed.quote && feed.quote.price);
  const prevClose = Number.isFinite(prev) && prev > 0
    ? prev
    : Number(feed.quote && feed.quote.prevClose);
  const open = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : px;
  let high = Math.max(px, open);
  let low = Math.min(px, open);

  if (!Array.isArray(feed.bars)) feed.bars = [];
  const bars = feed.bars.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = bars[bars.length - 1];
  if (last && String(last.date) === day) {
    high = Math.max(Number(last.high) || 0, high, px);
    low = Math.min(Number(last.low) || high, low, px);
    const keptOpen = Number(last.open);
    last.open = Number.isFinite(keptOpen) && keptOpen > 0 ? keptOpen : open;
    last.high = round2(high);
    last.low = round2(low);
    last.close = round2(px);
    last.source = "live";
  } else if (!last || day > String(last.date)) {
    bars.push({
      date: day,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(px),
      source: "live",
    });
  }
  feed.bars = bars;
  feed.quote = Object.assign({}, feed.quote || {}, {
    price: round2(px),
    open: round2(open),
    high: round2(high),
    low: round2(low),
    prevClose: Number.isFinite(prevClose) && prevClose > 0 ? round2(prevClose) : round2(open),
    time,
    sourceLabel: "浙商积存金(京东)",
  });
  feed.symbol = feed.symbol || "Au99.99";
  feed.currency = "CNY";
  feed.unit = "克";
  feed.note = "日线=每日开高低收（积存金口径）。实时价来自浙商积存金(京东)；在线时前端还会再拉一次覆盖。";
  feed.fetchedAt = new Date().toISOString();
  feed.mode = "backend-last";
  return feed;
}

function parseSelectRow(res) {
  const rows = (res && res.Rows) || [];
  if (!rows.length) return null;
  const cols = ((res && res.Columns) || []).map((c) => (typeof c === "string" ? c : c.Name || c.name || c));
  const row0 = rows[0];
  const obj = {};
  if (Array.isArray(row0)) {
    cols.forEach((c, i) => { obj[c] = row0[i]; });
  } else if (row0 && typeof row0 === "object") {
    Object.assign(obj, row0);
  }
  for (const k of ["quote_json", "news_json", "feed_json"]) {
    if (typeof obj[k] === "string") {
      try { obj[k] = JSON.parse(obj[k]); } catch {}
    }
  }
  return obj;
}

async function loadRow() {
  const res = await executeSql(`SELECT quote_json, news_json, feed_json, source, updated_at FROM jinjian_last_snapshot WHERE id='${SNAPSHOT_ID}' LIMIT 1;`);
  return parseSelectRow(res);
}

async function upsertRow(fields) {
  const quote = fields.quote_json || {};
  const news = fields.news_json || seedNews;
  const feed = fields.feed_json || seedFeed;
  const source = fields.source || "refresh";
  const sql = `INSERT INTO jinjian_last_snapshot (id, quote_json, news_json, feed_json, source, updated_at)
VALUES ('${SNAPSHOT_ID}', '${sqlStr(quote)}'::jsonb, '${sqlStr(news)}'::jsonb, '${sqlStr(feed)}'::jsonb, '${source}', now())
ON CONFLICT (id) DO UPDATE SET
  quote_json=EXCLUDED.quote_json,
  news_json=EXCLUDED.news_json,
  feed_json=EXCLUDED.feed_json,
  source=EXCLUDED.source,
  updated_at=now();`;
  await executeSql(sql);
}

/** Quote-only upsert: never overwrite news_json (COALESCE keeps existing). */
async function upsertQuotePreserveNews(fields) {
  const quote = fields.quote_json || {};
  const feed = fields.feed_json || seedFeed;
  const source = fields.source || "timer-quote";
  const fallbackNews = fields.news_json || seedNews;
  const sql = `INSERT INTO jinjian_last_snapshot (id, quote_json, news_json, feed_json, source, updated_at)
VALUES ('${SNAPSHOT_ID}', '${sqlStr(quote)}'::jsonb, '${sqlStr(fallbackNews)}'::jsonb, '${sqlStr(feed)}'::jsonb, '${source}', now())
ON CONFLICT (id) DO UPDATE SET
  quote_json=EXCLUDED.quote_json,
  feed_json=EXCLUDED.feed_json,
  source=EXCLUDED.source,
  updated_at=now();`;
  await executeSql(sql);
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, json, status: res.status };
  } catch (error) {
    return { ok: false, error: errDetail(error), url };
  }
}

/**
 * Refresh JD quote (+ feed). Optionally refresh news via NEWS_URL.
 * Timer / default refresh: includeNews=false → preserve existing news_json, do not call NEWS_URL.
 */
async function refreshSnapshot({ includeNews = false, sourceHint = null } = {}) {
  const diag = { includeNews: Boolean(includeNews), newsSkipped: !includeNews };
  const jd = await fetchJson(JD_URL);
  diag.jd = jd.ok ? { ok: true, price: jd.json && jd.json.resultData && jd.json.resultData.datas && jd.json.resultData.datas.price } : jd;
  let quote = null;
  if (jd.ok && jd.json && jd.json.resultData && jd.json.resultData.datas) quote = jd.json.resultData.datas;

  let existing = null;
  try { existing = await loadRow(); } catch (e) { diag.loadExisting = { ok: false, error: errDetail(e) }; }
  const baseFeed = pickBaseFeed(existing && existing.feed_json);
  const preservedNews = (existing && existing.news_json) || seedNews;

  let news = preservedNews;
  if (includeNews) {
    try {
      const nw = await fetchJson(NEWS_URL);
      diag.news = nw.ok ? { ok: true, items: (nw.json && nw.json.items && nw.json.items.length) || 0, url: NEWS_URL } : Object.assign({ url: NEWS_URL }, nw);
      if (nw.ok && nw.json && (nw.json.items || Array.isArray(nw.json))) news = nw.json;
    } catch (newsErr) {
      diag.news = { ok: false, error: errDetail(newsErr), url: NEWS_URL };
      news = preservedNews;
    }
  } else {
    diag.news = { ok: true, skipped: true, reason: "timer_or_quote_only_preserve_news_json" };
  }

  const feed = quote ? buildFeedFromQuote(quote, baseFeed) : JSON.parse(JSON.stringify(baseFeed));
  if (!quote) { feed.mode = "backend-seed"; feed.note = "实时价暂不可用，仍返回种子/上次行情。"; }

  const source = sourceHint || (includeNews ? (quote ? "refresh-both" : "refresh-both-seed") : (quote ? "timer-quote" : "timer-quote-seed"));
  try {
    if (includeNews) {
      await upsertRow({ quote_json: quote || (feed.quote || {}), news_json: news, feed_json: feed, source });
    } else {
      await upsertQuotePreserveNews({ quote_json: quote || (feed.quote || {}), news_json: preservedNews, feed_json: feed, source });
    }
    diag.upsert = { ok: true, mode: includeNews ? "quote+news" : "quote-only-preserve-news" };
  } catch (error) {
    diag.upsert = { ok: false, error: errDetail(error) };
  }
  return { feed, news, updatedAt: new Date().toISOString(), ok: Boolean(quote), diag, includeNews: Boolean(includeNews) };
}

function respondFromRow(row, kind) {
  const feed = (row && row.feed_json) || buildFeedFromQuote(row && row.quote_json, seedFeed);
  const news = (row && row.news_json) || seedNews;
  if (kind === "feed") return feed;
  if (kind === "news") return news;
  return { feed, news, updatedAt: row && row.updated_at, source: row && row.source };
}

exports.main = async (event) => {
  const http = isHttpTrigger(event);
  const method = String((event && (event.httpMethod || (event.requestContext && event.requestContext.httpMethod))) || "GET").toUpperCase();
  if (http && method === "OPTIONS") return httpResponse(204, "", event);
  const timer = isTimerTrigger(event);
  const p = requestPath(event).toLowerCase();
  const wantNews = wantsNewsRefresh(event, p);
  const wantQuote = wantsQuoteRefresh(event, p) || timer;
  const wantDiag = /diag|debug/.test(p) || (event && event.diag === true);
  try {
    // Timer OR explicit refresh / diag → run refresh (quote always; news only when asked / never on timer)
    if (wantQuote || wantDiag || wantNews) {
      let loadErr = null; let row = null;
      try { row = await loadRow(); } catch (e) { loadErr = errDetail(e); }
      const includeNews = wantNews && !timer;
      const out = await refreshSnapshot({
        includeNews,
        sourceHint: timer ? "timer-quote" : (includeNews ? "manual-refresh-both" : "manual-refresh-quote"),
      });
      const payload = Object.assign({}, out, {
        timer: Boolean(timer),
        load: loadErr ? { ok: false, error: loadErr } : { ok: true, hasFeed: Boolean(row && row.feed_json), source: row && row.source },
      });
      return http ? httpResponse(200, payload, event) : payload;
    }

    // Plain GET: read PG / seed only — never force news fetch; last-feed must not hit NEWS_URL
    let loadErr = null;
    let row = null;
    try { row = await loadRow(); } catch (e) { loadErr = errDetail(e); }
    if (!row || !row.feed_json) {
      // Bootstrap: quote-only + seed news (do not call /api/news)
      const out = await refreshSnapshot({ includeNews: false, sourceHint: "bootstrap-quote" });
      if (!out.ok && loadErr) {
        const payload = { success: false, resultMsg: "bootstrap failed", loadError: loadErr, diag: out.diag };
        return http ? httpResponse(500, payload, event) : payload;
      }
      row = { feed_json: out.feed, news_json: out.news, updated_at: out.updatedAt, source: "bootstrap" };
    }
    let kind = "all";
    if (p.includes("last-news") || p.endsWith("/news")) kind = "news";
    else if (p.includes("last-feed") || p.endsWith("/feed")) kind = "feed";
    else if (event && event.kind) kind = String(event.kind);
    const payload = respondFromRow(row, kind);
    return http ? httpResponse(200, payload, event) : payload;
  } catch (error) {
    const payload = { success: false, resultMsg: String(error && error.message ? error.message : error), detail: errDetail(error) };
    return http ? httpResponse(500, payload, event) : payload;
  }
};
