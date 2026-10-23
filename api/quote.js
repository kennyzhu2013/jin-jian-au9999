/**
 * Vercel serverless: 浙商积存金(京东) live quote.
 * Server-side pull of stdLatestPrice (productSku 1961543816). No API key.
 * Shared with worker.js via lib/jd-quote.mjs. Same upstream as cloudfunctions/jd-quote.
 *
 * Response keeps the previous feed keys (symbol, currency, unit, note, quote, bars)
 * and adds sourceLabel "浙商积存金(京东)". JD does not send intraday OHLC; open/high/low
 * are derived from price + yesterdayPrice. bars is a single today bar (source "live").
 * Raw upstream JSON is /api/jd-quote.
 */

import { fetchJdQuote } from "../lib/jd-quote.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await fetchJdQuote();
    if (!result.ok || !result.body) {
      res.status(502).json({ error: result.error || "京东积存金暂不可用" });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.status(200).json(result.body);
  } catch (error) {
    res.status(502).json({
      error: `京东积存金暂不可用: ${error && error.message ? error.message : error}`,
    });
  }
}
