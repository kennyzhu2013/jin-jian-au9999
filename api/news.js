/**
 * Vercel serverless: TianAPI 财经新闻 → jin-jian news feed
 * Env: TIANAPI_KEY (never hardcode)
 *
 * Upstream: GET https://apis.tianapi.com/caijing/index
 *   key, num, form=1, page, word (default 黄金)
 *
 * Optional env:
 *   TIANAPI_WORD   - search keyword (default 黄金)
 *   TIANAPI_NUM    - items 1-50 (default 20)
 *
 * Note: TianAPI terms say caijing is for internal analysis/ML, not terminal display.
 * Personal private use still requires your own key and reading their ToS.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TIANAPI_CAIJING = "https://apis.tianapi.com/caijing/index";

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

module.exports = async function handler(req, res) {
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
    res.status(502).json({ error: "TIANAPI_KEY is not configured" });
    return;
  }

  const q = req.query || {};
  const word =
    (typeof q.word === "string" && q.word.trim()) ||
    process.env.TIANAPI_WORD ||
    "黄金";
  const num = parseNum(
    q.num ?? process.env.TIANAPI_NUM,
    20,
    1,
    50
  );
  const page = parseNum(q.page, 1, 1, 100);

  const url = new URL(TIANAPI_CAIJING);
  url.searchParams.set("key", key);
  url.searchParams.set("num", String(num));
  url.searchParams.set("form", "1");
  url.searchParams.set("page", String(page));
  url.searchParams.set("word", word);

  let upstream;
  try {
    const r = await fetch(url.toString());
    upstream = await r.json();
  } catch (e) {
    res.status(502).json({
      error: `tianapi fetch failed: ${e?.message || String(e)}`,
    });
    return;
  }

  if (upstream?.code != null && Number(upstream.code) !== 200) {
    res.status(502).json({
      error: `tianapi code=${upstream.code}: ${upstream.msg || "error"}`,
    });
    return;
  }

  const list = upstream?.result?.list;
  if (!Array.isArray(list)) {
    res.status(502).json({ error: "tianapi result.list missing" });
    return;
  }

  const items = list.map(mapItem).filter(Boolean);

  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
  res.status(200).json({
    note: `天行财经 · word=${word}`,
    items,
  });
};
