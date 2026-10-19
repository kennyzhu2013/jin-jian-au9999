#!/usr/bin/env node
/**
 * Offline smoke test: jisu quote mapping + SGE Dailyhq bars mapping with fixtures.
 * No network, no real JISU_APPKEY.
 */

const SAMPLE_FEED = {
  status: 0,
  msg: "ok",
  result: [
    {
      type: "AU99.99",
      typename: "黄金9999",
      price: "958.12",
      openingprice: "952.00",
      maxprice: "960.50",
      minprice: "950.80",
      lastclosingprice: "951.20",
      updatetime: "2026-10-19 11:02:01",
    },
    {
      type: "AU99.95",
      typename: "黄金9995",
      price: "957.00",
      openingprice: "951.00",
      maxprice: "959.00",
      minprice: "950.00",
      lastclosingprice: "950.50",
      updatetime: "2026-10-19 11:02:01",
    },
  ],
};

/** Fixture shaped like POST https://www.sge.com.cn/graph/Dailyhq → { time: [[date,open,close,low,high], ...] } */
const SAMPLE_SGE_DAILYHQ = {
  time: [
    ["2026-04-01", 700.1, 705.2, 698.0, 706.5],
    ["2026-10-15", 890.0, 895.5, 888.0, 897.0],
    ["2026-10-16", 893.99, 901.57, 893.0, 902.0],
    ["2026-05-01", 710.0, 712.0, 709.0, 713.0], // out of order on purpose
  ],
};

function toNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null || v === "") return NaN;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

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

function mapSgeDailyhqToBars(dataJson, keep = 120) {
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

// --- quote mapping ---
const item = findAu9999(SAMPLE_FEED.result);
if (!item) {
  console.error("FAIL: AU99.99 not found in sample fixture");
  process.exit(1);
}

const quote = mapToQuote(item);
if (!quote) {
  console.error("FAIL: mapToQuote returned null");
  process.exit(1);
}

const expectedQuote = {
  price: 958.12,
  open: 952.0,
  high: 960.5,
  low: 950.8,
  prevClose: 951.2,
  time: "2026-10-19T11:02:01+08:00",
};

if (JSON.stringify(quote) !== JSON.stringify(expectedQuote)) {
  console.error("FAIL: quote mapping mismatch");
  console.error("got:", JSON.stringify(quote, null, 2));
  console.error("expected:", JSON.stringify(expectedQuote, null, 2));
  process.exit(1);
}

// --- bars mapping (SGE row order: date, open, close, low, high) ---
const bars = mapSgeDailyhqToBars(SAMPLE_SGE_DAILYHQ, 120);
const expectedBars = [
  {
    date: "2026-04-01",
    open: 700.1,
    high: 706.5,
    low: 698.0,
    close: 705.2,
    source: "sge",
  },
  {
    date: "2026-05-01",
    open: 710.0,
    high: 713.0,
    low: 709.0,
    close: 712.0,
    source: "sge",
  },
  {
    date: "2026-10-15",
    open: 890.0,
    high: 897.0,
    low: 888.0,
    close: 895.5,
    source: "sge",
  },
  {
    date: "2026-10-16",
    open: 893.99,
    high: 902.0,
    low: 893.0,
    close: 901.57,
    source: "sge",
  },
];

if (JSON.stringify(bars) !== JSON.stringify(expectedBars)) {
  console.error("FAIL: bars mapping mismatch");
  console.error("got:", JSON.stringify(bars, null, 2));
  console.error("expected:", JSON.stringify(expectedBars, null, 2));
  process.exit(1);
}

const out = {
  symbol: "Au99.99",
  currency: "CNY",
  unit: "克",
  note: "极速数据实时 · 上金所日线",
  quote,
  bars,
};

console.log("Mapped AU99.99 quote + SGE bars (sample-feed style):");
console.log(JSON.stringify(out, null, 2));
console.log("");
console.log(
  "Quote: price←price, open←openingprice, high←maxprice, low←minprice, prevClose←lastclosingprice; updatetime → ISO+08:00"
);
console.log(
  "Bars: SGE [date,open,close,low,high] → {date,open,high,low,close,source:'sge'}; sorted asc; volume omitted"
);
console.log("OK: matches expected quote + bars mapping");
