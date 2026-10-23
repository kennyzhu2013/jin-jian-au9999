/**
 * Vercel serverless: raw 京东积存金 stdLatestPrice body.
 * Same contract as cloudfunctions/jd-quote on HTTP success, and as the
 * frontend /api/jd-quote proxy: pass the upstream JSON through. No API key.
 * Normalized feed (quote + bars + sourceLabel) is /api/quote.
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
    res.status(405).json({ success: false, resultMsg: "Method not allowed" });
    return;
  }

  try {
    const result = await fetchJdQuote();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (!result.httpOk) {
      if (result.text) {
        res.status(502).send(result.text);
        return;
      }
      res.status(502).json({
        success: false,
        resultMsg: result.error || "京东积存金暂不可用",
      });
      return;
    }
    res.status(200).send(result.text);
  } catch (error) {
    res.status(502).json({
      success: false,
      resultMsg: String(error && error.message ? error.message : error),
    });
  }
}
