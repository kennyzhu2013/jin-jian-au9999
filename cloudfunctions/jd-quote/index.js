"use strict";
const crypto = require("crypto");
const https = require("https");

const ENV_ID = "testgold-d6g8l28m85a3d21aa";
const JD_URL = "https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=1961543816";
const SNAPSHOT_ID = "default";
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

function isHttpTrigger(event) {
  if (!event || typeof event !== "object") return false;
  return Boolean(event.httpMethod || event.requestContext || event.path || event.headers || typeof event.body === "string");
}
function httpResponse(statusCode, payload, event) {
  return { statusCode, headers: headersFor(event), body: typeof payload === "string" ? payload : JSON.stringify(payload), isBase64Encoded: false };
}
function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, data) { return crypto.createHmac("sha256", key).update(data, "utf8").digest(); }

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
  const secretDate = hmac(`TC3${secretKey}`, date);
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
    req.write(body);
    req.end();
  });
  const json = JSON.parse(text);
  if (json.Response && json.Response.Error) {
    throw new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`);
  }
  return json.Response || json;
}

async function executeSql(sql) {
  return callTcb("ExecutePGSql", { Sql: sql });
}

function sqlStr(obj) {
  return JSON.stringify(obj).replace(/'/g, "''");
}

async function saveQuoteSnapshot(payload) {
  try {
    const datas = payload && payload.resultData && payload.resultData.datas;
    if (!datas) return;
    const sql = `INSERT INTO jinjian_last_snapshot (id, quote_json, source, updated_at)
VALUES ('${SNAPSHOT_ID}', '${sqlStr(datas)}'::jsonb, 'jd-quote', now())
ON CONFLICT (id) DO UPDATE SET quote_json=EXCLUDED.quote_json, source=EXCLUDED.source, updated_at=now();`;
    await executeSql(sql);
  } catch (err) {
    console.error("saveQuoteSnapshot", err && err.message ? err.message : err);
  }
}

async function loadLastQuotePayload() {
  const res = await executeSql(`SELECT quote_json, updated_at FROM jinjian_last_snapshot WHERE id='${SNAPSHOT_ID}' LIMIT 1;`);
  const rows = (res && res.Rows) || [];
  if (!rows.length) return null;
  // Rows may be array of arrays or objects depending on API
  let quote = null; let updatedAt = null;
  const row0 = rows[0];
  if (Array.isArray(row0)) {
    quote = typeof row0[0] === "string" ? JSON.parse(row0[0]) : row0[0];
    updatedAt = row0[1];
  } else if (row0 && typeof row0 === "object") {
    quote = typeof row0.quote_json === "string" ? JSON.parse(row0.quote_json) : row0.quote_json;
    updatedAt = row0.updated_at;
  }
  if (!quote) return null;
  return {
    success: true, resultCode: 0, resultMsg: "cached", channelEncrypt: 0, cached: true, updatedAt,
    resultData: { status: "SUCCESS", datas: quote },
  };
}

async function fetchJdQuote() {
  const upstream = await fetch(JD_URL, { headers: { Accept: "application/json" } });
  const text = await upstream.text();
  return { ok: upstream.ok, text };
}

exports.main = async (event) => {
  const http = isHttpTrigger(event);
  const method = String((event && (event.httpMethod || (event.requestContext && event.requestContext.httpMethod))) || "GET").toUpperCase();
  if (http && method === "OPTIONS") return httpResponse(204, "", event);
  try {
    const { ok, text } = await fetchJdQuote();
    if (!ok) {
      const cached = await loadLastQuotePayload().catch(() => null);
      if (cached) return http ? httpResponse(200, cached, event) : cached;
      let payload; try { payload = JSON.parse(text); } catch { payload = { success: false, resultMsg: "upstream error" }; }
      return http ? httpResponse(502, payload, event) : payload;
    }
    let parsed = null; try { parsed = JSON.parse(text); } catch {}
    if (parsed && parsed.success !== false) await saveQuoteSnapshot(parsed);
    if (http) return { statusCode: 200, headers: headersFor(event), body: text, isBase64Encoded: false };
    return parsed != null ? parsed : JSON.parse(text);
  } catch (error) {
    const cached = await loadLastQuotePayload().catch(() => null);
    if (cached) return http ? httpResponse(200, cached, event) : cached;
    const payload = { success: false, resultMsg: String(error && error.message ? error.message : error) };
    return http ? httpResponse(502, payload, event) : payload;
  }
};
