"use strict";
/**
 * CloudBase SCF: TianAPI 财经新闻 → jin-jian news feed
 * Env: TIANAPI_KEY (also TIANAPI_KEY_B64 / TIANAPI_KEY_XOR)
 * Gateway: GET /api/news → this Event function
 *
 * Default mode: fetch latest caijing pages WITHOUT upstream `word=`
 * (TianAPI word=黄金 returns a stale relevance archive), then keep
 * gold/macro-relevant items. Pass ?word=... to force upstream search.
 */

const CORS_HEADERS = {
  // Gateway fills ACAO for real browser origins (security domains).
  // file:// / opaque opens send Origin: null — gateway omits ACAO then, so set * only for that case.
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

function applyNullOriginCors(event, headers) {
  const h = (event && event.headers) || {};
  // Gateway may omit Origin entirely for file:// (browser sends "null").
  // Only set * when no real https origin is present so gateway can still reflect safe domains.
  const origin = String(h.origin || h.Origin || h["origin"] || "").trim();
  if (!origin || origin === "null") {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

const TIANAPI_CAIJING = "https://apis.tianapi.com/caijing/index";
/** When TianAPI quota/key fails, pull already-normalized feed from this URL. */
const FALLBACK_NEWS_URL =
  process.env.NEWS_FALLBACK_URL ||
  "https://jinjian-quote-proxy.vercel.app/api/news";

/** Soft in-memory cache (SCF warm instances) to avoid burning TianAPI quota. */
const CACHE_TTL_MS = Number(process.env.NEWS_CACHE_TTL_MS || 10 * 60 * 1000);
/** @type {{ note: string, items: any[], fetchedAt: number } | null} */
let newsCache = null;

function readCache() {
  if (!newsCache || !Array.isArray(newsCache.items) || newsCache.items.length === 0) return null;
  if (Date.now() - newsCache.fetchedAt > CACHE_TTL_MS) return null;
  return newsCache;
}

function writeCache(note, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  newsCache = { note, items, fetchedAt: Date.now() };
}

async function fetchFallbackNews() {
  const r = await fetch(FALLBACK_NEWS_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`fallback HTTP ${r.status}`);
  const data = await r.json();
  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("fallback items missing");
  }
  const note = String(data.note || "fallback news").trim() || "fallback news";
  return { note: `${note} · via fallback`, items: data.items };
}

function loadSeedNews() {
  try {
    const seedPath = require("path").join(__dirname, "seed-news.json");
    if (!require("fs").existsSync(seedPath)) return null;
    const data = JSON.parse(require("fs").readFileSync(seedPath, "utf8"));
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return null;
    const note = String(data.note || "seed news").trim() || "seed news";
    return { note: `${note} · packaged seed`, items: data.items };
  } catch {
    return null;
  }
}

const TOPIC_RULES = [
  { topic: "fed", re: /美联储|降息|加息|鲍威尔|联邦基金|FOMC|非农|CPI|通胀/i },
  { topic: "usd", re: /美元|美指|DXY|人民币汇|离岸人民币|CNH|CNY/i },
  { topic: "geopolitics", re: /地缘|冲突|战争|制裁|避险|中东|乌克兰|台海/i },
  { topic: "sge", re: /上金所|上海黄金|Au99\.?99|纸黄金|国内金价/i },
  { topic: "china", re: /央行|外管|黄金储备|金饰|人民银行|PBOC|中国/i },
  { topic: "gold", re: /黄金|金价|贵金属|现货金|COMEX|伦敦金|XAU/i },
];

const BULLISH = /上涨|走强|创新高|避险买盘|降息预期|购金|增持|ETF流入|突破|利多|看多/i;
const BEARISH = /下跌|走弱|承压|加息|美元走强|抛售|流出|回落|利空|看空|高位回/i;

/** Gold/precious-metal relevance. Avoid bare 购金 (matches 回购金额). */
const GOLD_RE =
  /黄金|金价|贵金属|现货金|COMEX|伦敦金|XAU|上金所|上海黄金|金饰|纸黄金|Au99\.?99|金储备|增持黄金|买入黄金|国际金/i;

/** Macro drivers that still matter for Au outlook when gold headlines are sparse. */
const MACRO_RE =
  /美联储|降息|加息|鲍威尔|联邦基金|FOMC|非农|CPI|通胀|美元|美指|DXY|地缘|避险|中东|乌克兰/i;

function inferTopic(text) {
  for (const rule of TOPIC_RULES) {
    if (rule.re.test(text)) return rule.topic;
  }
  return "gold";
}

function inferBias(text) {
  const bull = BULLISH.test(text) ? 1 : 0;
  const bear = BEARISH.test(text) ? 1 : 0;
  if (bull && !bear) return 0.8;
  if (bear && !bull) return -0.8;
  if (bull && bear) return 0.2;
  return 0;
}

function inferHorizon(topic) {
  if (topic === "fed" || topic === "china") return "medium";
  if (topic === "geopolitics" || topic === "sge") return "short";
  return "both";
}

function ctimeToIso(ctime) {
  if (!ctime || typeof ctime !== "string") return null;
  const s = ctime.trim();
  const withTime = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (withTime) {
    const [, d, hh, mm, ss] = withTime;
    const h = String(hh).padStart(2, "0");
    const sec = ss != null ? ss : "00";
    return `${d}T${h}:${mm}:${sec}+08:00`;
  }
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T12:00:00+08:00`;
  return null;
}

function mapItem(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  if (!id || !title) return null;

  const summary = String(row.description ?? "").trim() || title;
  const source = String(row.source ?? "天行财经").trim() || "天行财经";
  const publishedAt = ctimeToIso(row.ctime) || new Date().toISOString();
  const blob = `${title}\n${summary}`;
  const topic = inferTopic(blob);
  const bias = inferBias(blob);
  const horizon = inferHorizon(topic);

  const out = {
    id: `tian-${id}`,
    publishedAt,
    source: `天行 · ${source}`,
    title,
    summary,
    topic,
    bias,
    horizon,
  };
  const url = String(row.url ?? "").trim();
  if (url) out.url = url;
  return out;
}

function parseNum(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function resolveTianApiKey() {
  // Prefer env; fall back to packaged XOR hex (avoids cloud-mode env injection redaction)
  try {
    if (!process.env.TIANAPI_KEY_XOR) {
      const p = require("path").join(__dirname, "tianapi_key.xor");
      if (require("fs").existsSync(p)) {
        process.env.TIANAPI_KEY_XOR = require("fs").readFileSync(p, "utf8").trim();
      }
    }
  } catch { /* ignore */ }
  const direct = process.env.TIANAPI_KEY;
  if (direct && String(direct).trim() && String(direct).trim() !== "[REDACTED]") {
    return String(direct).trim();
  }
  const b64 = process.env.TIANAPI_KEY_B64;
  if (b64 && String(b64).trim() && String(b64).trim() !== "[REDACTED]") {
    try {
      const decoded = Buffer.from(String(b64).trim(), "base64").toString("utf8").trim();
      if (decoded && decoded !== "[REDACTED]") return decoded;
    } catch {
      /* ignore */
    }
  }
  const xorHex = process.env.TIANAPI_KEY_XOR;
  if (xorHex && String(xorHex).trim() && String(xorHex).trim() !== "[REDACTED]") {
    try {
      const PAD = "jinjian-au9999-tianapi-pad-v1!!";
      const enc = Buffer.from(String(xorHex).trim(), "hex");
      const pb = Buffer.from(
        PAD.repeat(Math.ceil(enc.length / PAD.length)).slice(0, enc.length),
        "utf8"
      );
      const out = Buffer.alloc(enc.length);
      for (let i = 0; i < enc.length; i++) out[i] = enc[i] ^ pb[i];
      const decoded = out.toString("utf8").trim();
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function httpResponse(statusCode, payload, extraHeaders, event) {
  const headers = applyNullOriginCors(event, Object.assign({}, CORS_HEADERS, extraHeaders || {}));
  return {
    statusCode,
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    isBase64Encoded: false,
  };
}

function getMethod(event) {
  return String(
    (event && (event.httpMethod || event.requestContext && event.requestContext.httpMethod)) ||
      "GET"
  ).toUpperCase();
}

function getQuery(event) {
  if (!event) return {};
  if (event.queryStringParameters && typeof event.queryStringParameters === "object") {
    return event.queryStringParameters;
  }
  if (event.query && typeof event.query === "object") return event.query;
  return {};
}

function isGoldRelevant(row) {
  const blob = `${row.title || ""}\n${row.description || ""}`;
  return GOLD_RE.test(blob);
}

function isMacroRelevant(row) {
  const blob = `${row.title || ""}\n${row.description || ""}`;
  return MACRO_RE.test(blob);
}

async function fetchCaijingPage(key, { num, page, word }) {
  const url = new URL(TIANAPI_CAIJING);
  url.searchParams.set("key", key);
  url.searchParams.set("num", String(num));
  url.searchParams.set("form", "1");
  url.searchParams.set("page", String(page));
  if (word) url.searchParams.set("word", word);

  const r = await fetch(url.toString());
  const upstream = await r.json();
  if (upstream && upstream.code != null && Number(upstream.code) !== 200) {
    const err = new Error(`tianapi code=${upstream.code}: ${upstream.msg || "error"}`);
    err.upstream = upstream;
    throw err;
  }
  const list = upstream && upstream.result && upstream.result.list;
  if (!Array.isArray(list)) {
    throw new Error("tianapi result.list missing");
  }
  return list;
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = String(row && row.id != null ? row.id : "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function sortByCtimeDesc(rows) {
  return rows.slice().sort((a, b) => {
    const ta = String(a.ctime || "");
    const tb = String(b.ctime || "");
    return tb.localeCompare(ta);
  });
}

/**
 * Latest-feed mode: scan recent pages (no word=), prefer gold headlines,
 * then macro drivers, then pad with remaining latest if still short.
 */
async function fetchLatestFiltered(key, num, pages) {
  const pageSize = 50;
  const batches = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      fetchCaijingPage(key, { num: pageSize, page: i + 1, word: "" })
    )
  );
  const all = dedupeById(batches.flat());
  const gold = sortByCtimeDesc(all.filter(isGoldRelevant));
  if (gold.length >= num) return { rows: gold.slice(0, num), mode: "gold", pages, scanned: all.length };

  const used = new Set(gold.map((r) => String(r.id)));
  const macro = sortByCtimeDesc(
    all.filter((r) => !used.has(String(r.id)) && isMacroRelevant(r))
  );
  const mixed = gold.concat(macro);
  if (mixed.length >= num) {
    return { rows: mixed.slice(0, num), mode: "gold+macro", pages, scanned: all.length };
  }
  for (const r of sortByCtimeDesc(all)) {
    if (mixed.length >= num) break;
    const id = String(r.id);
    if (used.has(id)) continue;
    used.add(id);
    mixed.push(r);
  }
  return { rows: mixed.slice(0, num), mode: "latest-pad", pages, scanned: all.length };
}

exports.main = async (event) => {
  const method = getMethod(event);
  const respond = (statusCode, payload, extraHeaders) => httpResponse(statusCode, payload, extraHeaders, event);

  if (method === "OPTIONS") {
    return respond(204, "");
  }

  if (method !== "GET" && method !== "POST") {
    // Event invoke (timer/refresh) may have no httpMethod — treat as GET
    if (event && (event.httpMethod || event.requestContext || event.path || event.headers)) {
      return respond(405, { error: "Method not allowed" });
    }
  }

  const key = resolveTianApiKey();
  if (!key) {
    return respond(502, { error: "TIANAPI_KEY is not configured" });
  }

  const q = getQuery(event);
  // Explicit word only (query or env). Empty default avoids TianAPI's stale word-archive.
  const wordRaw =
    (typeof q.word === "string" && q.word.trim()) ||
    (typeof process.env.TIANAPI_WORD === "string" && process.env.TIANAPI_WORD.trim()) ||
    "";
  const word = wordRaw;
  const num = parseNum(q.num ?? process.env.TIANAPI_NUM, 20, 1, 50);
  const page = parseNum(q.page, 1, 1, 100);
  const pages = parseNum(q.pages ?? process.env.TIANAPI_PAGES, 1, 1, 8);

  const cached = readCache();
  if (cached) {
    return respond(
      200,
      { note: `${cached.note} · cache`, items: cached.items },
      { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
    );
  }

  let list;
  let note;
  let items;
  try {
    if (word) {
      list = await fetchCaijingPage(key, { num, page, word });
      note = `天行财经 · word=${word}`;
      items = list.map(mapItem).filter(Boolean);
    } else {
      const filtered = await fetchLatestFiltered(key, num, pages);
      list = filtered.rows;
      note = `天行财经 · 最新${filtered.pages}页筛选黄金相关`;
      items = list.map(mapItem).filter(Boolean);
    }
    writeCache(note, items);
  } catch (e) {
    const tianErr =
      e && e.upstream
        ? `tianapi code=${e.upstream.code}: ${e.upstream.msg || "error"}`
        : `tianapi fetch failed: ${e && e.message ? e.message : String(e)}`;

    // Prefer stale warm-cache even past TTL when upstream is down/quota-exhausted.
    if (newsCache && Array.isArray(newsCache.items) && newsCache.items.length) {
      return respond(
        200,
        {
          note: `${newsCache.note} · stale-cache (${tianErr})`,
          items: newsCache.items,
        },
        { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
      );
    }

    try {
      const fb = await fetchFallbackNews();
      writeCache(fb.note, fb.items);
      return respond(
        200,
        fb,
        { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
      );
    } catch (fbErr) {
      const seed = loadSeedNews();
      if (seed) {
        writeCache(seed.note, seed.items);
        return respond(
          200,
          {
            note: `${seed.note} (${tianErr}; fallback failed: ${
              fbErr && fbErr.message ? fbErr.message : String(fbErr)
            })`,
            items: seed.items,
          },
          { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
        );
      }
      return respond(502, {
        error: `${tianErr}; fallback failed: ${
          fbErr && fbErr.message ? fbErr.message : String(fbErr)
        }`,
      });
    }
  }

  return respond(
    200,
    { note, items },
    { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
  );
};
