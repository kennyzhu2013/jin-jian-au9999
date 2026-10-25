/**
 * Vercel serverless: TianAPI 财经新闻 → jin-jian news feed
 * Env (first non-empty wins): TIANAPI_KEY, TIANAPI_KEY_B64, TIANAPI_KEY_XOR
 * Never hardcode the key.
 *
 * Upstream: GET https://apis.tianapi.com/caijing/index
 *   key, num (1-50), form=1, page, optional word
 *
 * Default strategy (no ?word=, no ?page=, no TIANAPI_WORD):
 *   The caijing keyword index is narrower than the latest unfiltered list.
 *   Pull the newest pages (no word), keep rows whose title/description match
 *   a gold lexicon, dedupe, sort by time, return the latest N.
 *   Optional backfill: TIANAPI_NEWS_WORDS (comma-separated) merges extra
 *   keyword queries. "-" disables. Each upstream failure is skipped.
 *
 * Legacy single query (unchanged note/order) when ?word=, ?page=, or
 * TIANAPI_WORD is set.
 *
 * TianAPI terms: caijing is for internal analysis/ML, not terminal display.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TIANAPI_CAIJING = "https://apis.tianapi.com/caijing/index";

/** Title/description must match one of these. Bare 金/金融/基金/公积金 do not. */
const GOLD_RE =
  /黄金|金价|金市|贵金属|伦敦金|现货金|纸黄金|金条|金饰|沪金|上金所|COMEX|XAU|Au99\.?99|AU99\.?99/i;

const DEFAULT_CHRONO_PAGES = 4;
const MAX_CHRONO_PAGES = 4;
const CHRONO_PAGE_SIZE = 50;
const MAX_BACKFILL_WORDS = 2;
const CONCURRENCY = 2;
const FETCH_TIMEOUT_MS = 3500;
const BUDGET_MS = 9000;
const MULTI_CACHE_SECONDS = 600;
const PARTIAL_CACHE_SECONDS = 60;

/** @type {Map<string, { at: number, ttl: number, payload: object }>} */
const responseCache = new Map();

/** Simple keyword heuristics so strategy module gets topic/bias without LLM. */
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

/**
 * TianAPI ctime examples: "2021-02-04 18:00" or "2015-07-17"
 * → ISO with +08:00 when time present; date-only → noon +08:00
 */
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

function isGoldRelated(text) {
  return GOLD_RE.test(String(text || ""));
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

function queryValue(q, name) {
  const v = q?.[name];
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  if (v == null) return "";
  return String(v).trim();
}

function parseChronoPages(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CHRONO_PAGES;
  return Math.min(MAX_CHRONO_PAGES, Math.max(1, Math.floor(n)));
}

function parseBackfillWords(raw) {
  if (raw == null) return [];
  const t = String(raw).trim();
  if (!t || t === "-" || t === "0" || /^off$/i.test(t) || /^none$/i.test(t)) {
    return [];
  }
  const out = [];
  for (const part of t.split(/[,，]+/)) {
    const w = part.trim();
    if (!w || out.includes(w)) continue;
    out.push(w);
    if (out.length >= MAX_BACKFILL_WORDS) break;
  }
  return out;
}

function itemsFromList(list, requireGold) {
  const items = [];
  for (const row of list || []) {
    if (requireGold) {
      const blob = `${row?.title ?? ""}\n${row?.description ?? ""}`;
      if (!isGoldRelated(blob)) continue;
    }
    const item = mapItem(row);
    if (item) items.push(item);
  }
  return items;
}

function mergeNewsItems(items, limit) {
  const byId = new Map();
  for (const item of items) {
    if (!item || !item.id) continue;
    const prev = byId.get(item.id);
    if (!prev || String(item.publishedAt) > String(prev.publishedAt)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      if (a.publishedAt !== b.publishedAt) {
        return a.publishedAt < b.publishedAt ? 1 : -1;
      }
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    })
    .slice(0, limit);
}

function memoryCacheTtlMs() {
  const n = Number(process.env.TIANAPI_NEWS_CACHE_SECONDS);
  if (n === 0) return 0;
  if (Number.isFinite(n) && n > 0) return Math.min(3600, Math.floor(n)) * 1000;
  return MULTI_CACHE_SECONDS * 1000;
}

function cacheGet(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    responseCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  responseCache.set(key, { at: Date.now(), ttl: ttlMs, payload });
}

function clearNewsCache() {
  responseCache.clear();
}

function resolveTianApiKey() {
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

async function fetchCaijing(key, params, timeoutMs) {
  const url = new URL(TIANAPI_CAIJING);
  url.searchParams.set("key", key);
  url.searchParams.set("num", String(params.num));
  url.searchParams.set("form", "1");
  url.searchParams.set("page", String(params.page || 1));
  if (params.word) url.searchParams.set("word", params.word);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url.toString(), { signal: ctrl.signal });
    let body;
    try {
      body = await r.json();
    } catch {
      return { ok: false, error: "tianapi invalid json" };
    }
    const code = body?.code != null ? Number(body.code) : 200;
    if (code === 250) return { ok: true, list: [] };
    if (code !== 200) {
      return {
        ok: false,
        error: `tianapi code=${code}: ${body?.msg || "error"}`,
        code,
      };
    }
    const list = body?.result?.list;
    if (!Array.isArray(list)) {
      return { ok: false, error: "tianapi result.list missing" };
    }
    return { ok: true, list };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "timeout" : e?.message || String(e);
    return { ok: false, error: `tianapi fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCaijingWithRetry(key, params, timeoutMs) {
  const first = await fetchCaijing(key, params, timeoutMs);
  if (first.ok || first.code !== 130) return first;
  await new Promise((resolve) => setTimeout(resolve, 400));
  return fetchCaijing(key, params, timeoutMs);
}

async function mapPool(jobs, limit, fn) {
  const ret = new Array(jobs.length);
  let cursor = 0;
  const workers = Math.min(limit, jobs.length);
  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor;
      cursor += 1;
      ret[idx] = await fn(jobs[idx]);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

function buildMultiNote({ pages, words, failed, skipped }) {
  const bits = [`天行财经 · 最新${pages}页筛选黄金相关`];
  if (words.length) bits.push(`回补:${words.join("+")}`);
  if (skipped) bits.push("后续请求超时跳过");
  if (failed) bits.push("部分上游失败");
  return bits.join(" · ");
}

async function handleLegacy(res, key, { word, num, page }) {
  const result = await fetchCaijing(key, { num, page, word }, FETCH_TIMEOUT_MS);
  if (!result.ok) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: result.error });
    return;
  }
  const items = result.list.map(mapItem).filter(Boolean);
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
  res.status(200).json({
    note: `天行财经 · word=${word}`,
    items,
  });
}

async function handleMulti(res, key, { num, pages, words }) {
  const cacheKey = JSON.stringify({ num, pages, words });
  const cached = cacheGet(cacheKey);
  if (cached) {
    const ttl = cached.failed ? PARTIAL_CACHE_SECONDS : MULTI_CACHE_SECONDS;
    res.setHeader(
      "Cache-Control",
      `public, max-age=${ttl}, s-maxage=${ttl}`
    );
    res.status(200).json({ note: cached.note, items: cached.items });
    return;
  }

  const started = Date.now();
  const pageJobs = [];
  for (let page = 1; page <= pages; page += 1) {
    pageJobs.push({ page, num: CHRONO_PAGE_SIZE, requireGold: true });
  }
  const wordJobs = words.map((word) => ({
    page: 1,
    num,
    word,
    requireGold: true,
  }));

  const first = pageJobs.slice(0, CONCURRENCY);
  const second = pageJobs.slice(CONCURRENCY).concat(wordJobs);

  let failed = false;
  let anyOk = false;
  const errors = [];
  const collected = [];

  async function run(job, timeoutMs) {
    const result = await fetchCaijingWithRetry(
      key,
      { num: job.num, page: job.page, word: job.word },
      timeoutMs
    );
    if (!result.ok) {
      failed = true;
      if (result.error && errors.length < 3) errors.push(result.error);
      return;
    }
    anyOk = true;
    collected.push(...itemsFromList(result.list, job.requireGold));
  }

  await mapPool(first, CONCURRENCY, (job) => run(job, FETCH_TIMEOUT_MS));

  let skipped = false;
  if (second.length) {
    const elapsed = Date.now() - started;
    const remaining = BUDGET_MS - elapsed;
    if (remaining < FETCH_TIMEOUT_MS) {
      skipped = true;
      failed = true;
    } else {
      const timeoutMs = Math.min(FETCH_TIMEOUT_MS, remaining - 200);
      await mapPool(second, CONCURRENCY, (job) => run(job, timeoutMs));
    }
  }

  if (!anyOk) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: errors[0] || "tianapi fetch failed" });
    return;
  }

  const items = mergeNewsItems(collected, num);
  const note = buildMultiNote({ pages, words, failed, skipped });
  const edgeTtl = failed ? PARTIAL_CACHE_SECONDS : MULTI_CACHE_SECONDS;
  const configuredMem = memoryCacheTtlMs();
  const memTtl =
    configuredMem === 0
      ? 0
      : failed
        ? Math.min(configuredMem, PARTIAL_CACHE_SECONDS * 1000)
        : configuredMem;
  cacheSet(cacheKey, { note, items, failed }, memTtl);

  res.setHeader("Cache-Control", `public, max-age=${edgeTtl}, s-maxage=${edgeTtl}`);
  res.status(200).json({ note, items });
}

async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = resolveTianApiKey();
  if (!key) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "TIANAPI_KEY is not configured" });
    return;
  }

  const q = req.query || {};
  const qWord = queryValue(q, "word");
  const qPage = queryValue(q, "page");
  const envWord = process.env.TIANAPI_WORD && String(process.env.TIANAPI_WORD).trim();
  const num = parseNum(q.num ?? process.env.TIANAPI_NUM, 20, 1, 50);

  if (qWord || qPage || envWord) {
    const word = qWord || envWord || "黄金";
    const page = parseNum(qPage || "1", 1, 1, 100);
    await handleLegacy(res, key, { word, num, page });
    return;
  }

  const pages = parseChronoPages(
    queryValue(q, "pages") || process.env.TIANAPI_NEWS_PAGES
  );
  const wordSource = queryValue(q, "words")
    ? queryValue(q, "words")
    : process.env.TIANAPI_NEWS_WORDS;
  const words = parseBackfillWords(wordSource);
  await handleMulti(res, key, { num, pages, words });
}

export default handler;
export {
  ctimeToIso,
  isGoldRelated,
  mapItem,
  mergeNewsItems,
  itemsFromList,
  parseBackfillWords,
  clearNewsCache,
  resolveTianApiKey,
};
