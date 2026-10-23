/**
 * Cloudflare Worker: 浙商积存金(京东) live quote.
 * Imports lib/jd-quote.mjs — deploy the module with this file (do not paste worker.js alone).
 * No JISU_APPKEY. Same upstream as cloudfunctions/jd-quote.
 *
 * /api/quote and /quote → normalized feed (sourceLabel 浙商积存金(京东)).
 * /api/jd-quote and /jd-quote → raw JD JSON.
 */

import { fetchJdQuote } from "./lib/jd-quote.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const raw = path === "/api/jd-quote" || path === "/jd-quote";
    const normalized = path === "/api/quote" || path === "/quote";
    if (!raw && !normalized) {
      return json({ error: "Not found" }, 404);
    }

    let result;
    try {
      result = await fetchJdQuote();
    } catch (error) {
      const message = `京东积存金暂不可用: ${error && error.message ? error.message : error}`;
      return raw
        ? json({ success: false, resultMsg: message }, 502)
        : json({ error: message }, 502);
    }

    if (raw) {
      if (!result.httpOk) {
        if (result.text) {
          return new Response(result.text, {
            status: 502,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              ...CORS_HEADERS,
            },
          });
        }
        return json(
          { success: false, resultMsg: result.error || "京东积存金暂不可用" },
          502
        );
      }
      return new Response(result.text, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      });
    }

    if (!result.ok || !result.body) {
      return json({ error: result.error || "京东积存金暂不可用" }, 502);
    }

    return json(result.body, 200, {
      "Cache-Control": "public, max-age=30, s-maxage=30",
    });
  },
};
