/**
 * 浙商积存金（京东积存金）实时价。服务端拉取，无需密钥。
 * 与 cloudfunctions/jd-quote 同一上游：stdLatestPrice + productSku=1961543816。
 * 该接口不支持浏览器跨域，只从 Vercel / Cloudflare Worker / 云函数里调用。
 */

export const JD_PRODUCT_SKU = "1961543816";
export const SOURCE_LABEL = "浙商积存金(京东)";
export const JD_QUOTE_URL =
  `https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=${JD_PRODUCT_SKU}`;

/** Legacy feed key kept so existing quote consumers still see symbol Au99.99. The product is 浙商积存金, not 上金所 Au99.99. */
export const FEED_SYMBOL = "Au99.99";

const QUOTE_NOTE =
  "实时价来自浙商积存金(京东) stdLatestPrice（服务端拉取）。京东该接口只给现价、昨收和时间，没有日内开高低：open/prevClose 用昨收，high/low 取现价与昨收的较大/较小值。bars 只有由该现价生成的当日一根，不再使用极速 shgold 或上金所 Au99.99。";

export function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return NaN;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
}

export function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Epoch ms → "YYYY-MM-DDTHH:mm:ss+08:00" (Asia/Shanghai wall clock).
 * Same shift the CloudBase snapshot and the frontend JD loader use.
 */
export function toIso8(ms, nowMs = Date.now()) {
  const n = Number(ms);
  const t = Number.isFinite(n) && n > 0 ? n : nowMs;
  return new Date(t + 8 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "+08:00");
}

/** JD JSON → resultData.datas, or null when the payload has no usable price. */
export function parseJdQuotePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.success === false) return null;
  const resultData = payload.resultData;
  if (!resultData || typeof resultData !== "object") return null;
  if (resultData.status && resultData.status !== "SUCCESS") return null;
  const datas = resultData.datas;
  if (!datas || typeof datas !== "object") return null;
  const price = toNumber(datas.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return datas;
}

/**
 * Map JD datas onto the feed quote object.
 * open/high/low are derived: this upstream has price + yesterdayPrice only.
 */
export function mapJdDatasToQuote(datas, nowMs = Date.now()) {
  const price = toNumber(datas && datas.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const prev = toNumber(datas && datas.yesterdayPrice);
  const prevClose = Number.isFinite(prev) && prev > 0 ? prev : price;
  const open = prevClose;
  const high = Math.max(price, open);
  const low = Math.min(price, open);
  return {
    price: round2(price),
    open: round2(open),
    high: round2(high),
    low: round2(low),
    prevClose: round2(prevClose),
    time: toIso8(datas && datas.time, nowMs),
    sourceLabel: SOURCE_LABEL,
  };
}

export function barFromQuote(quote) {
  if (!quote) return null;
  const date = String(quote.time || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    date,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.price,
    source: "live",
  };
}

/** Normalized /api/quote body. Keeps the previous feed keys and adds sourceLabel. */
export function buildQuoteResponse(datas, nowMs = Date.now()) {
  const quote = mapJdDatasToQuote(datas, nowMs);
  if (!quote) return null;
  const bar = barFromQuote(quote);
  return {
    symbol: FEED_SYMBOL,
    currency: "CNY",
    unit: "克",
    sourceLabel: SOURCE_LABEL,
    productSku: String((datas && datas.productSku) || JD_PRODUCT_SKU),
    note: QUOTE_NOTE,
    quote,
    bars: bar ? [bar] : [],
  };
}

/**
 * Server-side pull of the JD upstream.
 * `httpOk` is the upstream HTTP status (raw /api/jd-quote passes that body through).
 * `ok` / `body` are set only when the JSON has a usable price for /api/quote.
 */
export async function fetchJdQuote(fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(JD_QUOTE_URL, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    return {
      ok: false,
      httpOk: false,
      status: 0,
      text: "",
      datas: null,
      body: null,
      error: `京东积存金暂不可用: ${error && error.message ? error.message : error}`,
    };
  }

  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const datas = response.ok ? parseJdQuotePayload(parsed) : null;
  const body = datas ? buildQuoteResponse(datas) : null;
  if (!response.ok) {
    return {
      ok: false,
      httpOk: false,
      status: response.status,
      text,
      datas: null,
      body: null,
      error: `京东积存金暂不可用: HTTP ${response.status}`,
    };
  }
  if (!body) {
    return {
      ok: false,
      httpOk: true,
      status: response.status,
      text,
      datas: null,
      body: null,
      error: "京东积存金暂不可用: 上游没有可用现价",
    };
  }
  return {
    ok: true,
    httpOk: true,
    status: response.status,
    text,
    datas,
    body,
    error: null,
  };
}
