/**
 * Vercel serverless: jisuapi shgold realtime + SGE Dailyhq bars → jin-jian quote
 * Env: JISU_APPKEY (never hardcode)
 *
 * History: POST https://www.sge.com.cn/graph/Dailyhq (same as AKShare spot_hist_sge)
 * Payload: instid=Au99.99 → { time: [[date, open, close, low, high], ...] }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SGE_DAILYHQ_URL = "https://www.sge.com.cn/graph/Dailyhq";
const SGE_SYMBOL = "Au99.99";
const BARS_KEEP = 120;
const BARS_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

/** @type {{ bars: Array, fetchedAt: number } | null} */
let barsCache = null;

function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null || v === "") return NaN;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

/**
 * "2026-10-19 11:02:01" → "2026-10-19T11:02:01+08:00"
 */
function updatetimeToIso(updatetime) {
  if (!updatetime || typeof updatetime !== "string") return null;
  const s = updatetime.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  return `${m[1]}T${m[2]}+08:00`;
}

function findAu9999(list) {
  if (!Array.isArray(list)) return null;
  return (
    list.find((item) => {
      if (!item || typeof item !== "object") return false;
      const type = String(item.type ?? "").trim();
      const typename = String(item.typename ?? "").trim();
      return (
        type === "AU99.99" ||
        type === "AU9999" ||
        typename === "AU9999" ||
        typename === "AU99.99"
      );
    }) ?? null
  );
}

function mapToQuote(item) {
  const price = toNumber(item.price);
  const open = toNumber(item.openingprice);
  const high = toNumber(item.maxprice);
  const low = toNumber(item.minprice);
  const prevClose = toNumber(item.lastclosingprice);
  const time = updatetimeToIso(item.updatetime);

  if (
    [price, open, high, low, prevClose].some((n) => Number.isNaN(n)) ||
    !time
  ) {
    return null;
  }

  return {
    price,
    open,
    high,
    low,
    prevClose,
    time,
  };
}

/**
 * SGE row: [date, open, close, low, high] → bar object (no volume).
 */
function mapSgeRowToBar(row) {
  if (!Array.isArray(row) || row.length < 5) return null;
  const dateRaw = row[0];
  const date =
    typeof dateRaw === "string"
      ? dateRaw.trim().slice(0, 10)
      : String(dateRaw ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const open = toNumber(row[1]);
  const close = toNumber(row[2]);
  const low = toNumber(row[3]);
  const high = toNumber(row[4]);
  if ([open, high, low, close].some((n) => Number.isNaN(n))) return null;

  return {
    date,
    open,
    high,
    low,
    close,
    source: "sge",
  };
}

/**
 * Parse SGE Dailyhq JSON → bars ascending by date, last BARS_KEEP days.
 */
export function mapSgeDailyhqToBars(dataJson, keep = BARS_KEEP) {
  const rows = dataJson?.time;
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const bars = [];
  for (const row of rows) {
    const bar = mapSgeRowToBar(row);
    if (bar) bars.push(bar);
  }

  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (keep > 0 && bars.length > keep) {
    return bars.slice(-keep);
  }
  return bars;
}

async function fetchSgeBars() {
  const now = Date.now();
  if (
    barsCache &&
    Array.isArray(barsCache.bars) &&
    barsCache.bars.length > 0 &&
    now - barsCache.fetchedAt < BARS_CACHE_TTL_MS
  ) {
    return { bars: barsCache.bars, fromCache: true, error: null };
  }

  const headers = {
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    Origin: "https://www.sge.com.cn",
    Referer: "https://www.sge.com.cn/sjzx/mrhq",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
  };

  const r = await fetch(SGE_DAILYHQ_URL, {
    method: "POST",
    headers,
    body: `instid=${encodeURIComponent(SGE_SYMBOL)}`,
  });

  if (!r.ok) {
    throw new Error(`SGE Dailyhq HTTP ${r.status}`);
  }

  const dataJson = await r.json();
  const bars = mapSgeDailyhqToBars(dataJson, BARS_KEEP);
  if (bars.length === 0) {
    throw new Error("SGE Dailyhq returned no usable bars");
  }

  barsCache = { bars, fetchedAt: now };
  return { bars, fromCache: false, error: null };
}

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const appkey = process.env.JISU_APPKEY;
  if (!appkey) {
    res.status(502).json({ error: "JISU_APPKEY is not configured" });
    return;
  }

  const url = `https://api.jisuapi.com/gold/shgold?appkey=${encodeURIComponent(appkey)}`;

  let upstream;
  let jisuError = null;
  try {
    const r = await fetch(url);
    upstream = await r.json();
  } catch (e) {
    jisuError = e?.message || String(e);
  }

  let quote = null;
  if (!jisuError && upstream) {
    if (upstream.status != null && Number(upstream.status) !== 0) {
      jisuError =
        upstream?.msg ||
        upstream?.message ||
        `jisuapi error status=${upstream?.status}`;
    } else {
      const list = upstream.result || upstream.data || [];
      const item = findAu9999(list);
      if (!item) {
        jisuError = "AU99.99 not found in jisuapi response";
      } else {
        quote = mapToQuote(item);
        if (!quote) jisuError = "AU99.99 fields could not be parsed";
      }
    }
  }

  let bars = [];
  let barsNote = null;
  try {
    const result = await fetchSgeBars();
    bars = result.bars;
  } catch (e) {
    barsNote = `上金所日线暂不可用: ${e?.message || String(e)}`;
    if (barsCache?.bars?.length) {
      bars = barsCache.bars;
      barsNote = null;
    }
  }

  if (!quote && bars.length === 0) {
    res.status(502).json({
      error: `both sources failed: jisu=${jisuError || "unknown"}; sge=${barsNote || "empty"}`,
    });
    return;
  }

  if (!quote) {
    res.status(502).json({ error: String(jisuError || "jisuapi failed") });
    return;
  }

  const note = bars.length
    ? "极速数据实时 · 上金所日线"
    : `极速数据实时 · 日线回退空 (${barsNote || "no bars"})`;

  const body = {
    symbol: "Au99.99",
    currency: "CNY",
    unit: "克",
    note,
    quote,
    bars,
  };

  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
  res.status(200).json(body);
}
