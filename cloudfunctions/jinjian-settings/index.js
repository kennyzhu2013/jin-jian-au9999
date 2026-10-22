"use strict";
const crypto = require("crypto");
const https = require("https");

const ENV_ID = "testgold-d6g8l28m85a3d21aa";
const SETTINGS_ID = "default";
const MAX_ALERTS = 12;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const SEED_ALERTS = [
  { id: "seed-buy", side: "buy", price: 900, note: "整数关口", createdAt: "2026-10-09T15:30:00+08:00" },
  { id: "seed-sell", side: "sell", price: 948, note: "九月中段平台", createdAt: "2026-10-09T15:30:00+08:00" },
];

function isHttpTrigger(event) {
  if (!event || typeof event !== "object") return false;
  return Boolean(event.httpMethod || event.requestContext || event.path || event.headers || typeof event.body === "string");
}
function httpMethod(event) {
  const m = String((event && (event.httpMethod || event.method || (event.requestContext && event.requestContext.httpMethod))) || "GET").toUpperCase();
  return m;
}
function httpResponse(statusCode, payload) {
  return { statusCode, headers: JSON_HEADERS, body: typeof payload === "string" ? payload : JSON.stringify(payload), isBase64Encoded: false };
}
function parseBody(event) {
  if (!event) return {};
  if (event.body && typeof event.body === "object") return event.body;
  if (typeof event.body === "string" && event.body.trim()) {
    try { return JSON.parse(event.body); } catch { return {}; }
  }
  if (event.alerts || event.settings || event.myLevels) return event;
  return {};
}
function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmac(key, data) { return crypto.createHmac("sha256", key).update(data, "utf8").digest(); }
function sqlStr(obj) { return JSON.stringify(obj).replace(/'/g, "''"); }

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
  const secretDate = hmac("TC3" + secretKey, date);
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
    req.setTimeout(12000, () => { req.destroy(new Error("tcb https timeout")); });
    req.write(body);
    req.end();
  });
  const json = JSON.parse(text);
  if (json.Response && json.Response.Error) throw new Error(`${json.Response.Error.Code}: ${json.Response.Error.Message}`);
  return json.Response || json;
}
async function executeSql(sql) { return callTcb("ExecutePGSql", { Sql: sql }); }

function columnNames(res) {
  const raw = (res && (res.Columns || res.ColumnNames || res.fields || res.FieldNames)) || [];
  return raw.map((c) => {
    if (typeof c === "string") return c;
    if (!c || typeof c !== "object") return String(c);
    return c.Name || c.name || c.column_name || c.Field || c.field || "";
  }).filter(Boolean);
}

function parseJsonField(v) {
  if (v == null) return v;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function parseSelectRow(res) {
  let rows = (res && (res.Rows || res.rows || res.Data || res.data || res.Result)) || [];
  if (typeof rows === "string") {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  // Some ExecutePGSql shapes nest under Items / List
  if (!Array.isArray(rows) && rows && typeof rows === "object") {
    rows = rows.Rows || rows.rows || rows.Items || rows.items || [];
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  const cols = columnNames(res);
  let row0 = rows[0];
  // CloudBase ExecutePGSql often returns each row as a JSON string of an array
  if (typeof row0 === "string") {
    try { row0 = JSON.parse(row0); } catch { return null; }
  }
  const obj = {};
  if (Array.isArray(row0)) {
    const names = cols.length ? cols : ["id", "alerts_json", "settings_json", "updated_at"];
    names.forEach((c, i) => { if (c) obj[c] = row0[i]; });
  } else if (row0 && typeof row0 === "object") {
    Object.assign(obj, row0);
  } else {
    return null;
  }
  obj.alerts_json = parseJsonField(obj.alerts_json);
  obj.settings_json = parseJsonField(obj.settings_json);
  // Require at least id or alerts_json to treat as valid
  if (obj.id == null && obj.alerts_json == null && obj.updated_at == null) return null;
  return obj;
}

function normalizeAlerts(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const alert of raw) {
    if (!alert || typeof alert !== "object") continue;
    const side = alert.side === "sell" ? "sell" : alert.side === "buy" ? "buy" : null;
    const price = Number(alert.price);
    if (!side || !Number.isFinite(price)) continue;
    out.push({
      id: typeof alert.id === "string" && alert.id.trim() ? alert.id.trim() : `a-${Date.now()}-${out.length}`,
      side,
      price,
      note: typeof alert.note === "string" ? alert.note : "",
      createdAt: typeof alert.createdAt === "string" && alert.createdAt ? alert.createdAt : new Date().toISOString(),
    });
    if (out.length >= MAX_ALERTS) break;
  }
  return out;
}

async function loadSettings() {
  const res = await executeSql(
    `SELECT id, alerts_json, settings_json, updated_at FROM jinjian_user_settings WHERE id='${SETTINGS_ID}' LIMIT 1;`
  );
  return parseSelectRow(res);
}

async function upsertSettings(alerts, settings) {
  const alertsSql = sqlStr(alerts);
  const settingsPart = settings == null
    ? "NULL"
    : `'${sqlStr(settings)}'::jsonb`;
  const sql = `INSERT INTO jinjian_user_settings (id, alerts_json, settings_json, updated_at)
VALUES ('${SETTINGS_ID}', '${alertsSql}'::jsonb, ${settingsPart}, now())
ON CONFLICT (id) DO UPDATE SET
  alerts_json=EXCLUDED.alerts_json,
  settings_json=COALESCE(EXCLUDED.settings_json, jinjian_user_settings.settings_json),
  updated_at=now();`;
  await executeSql(sql);
}

function toPayload(row) {
  const alerts = normalizeAlerts(row && row.alerts_json);
  return {
    ok: true,
    id: (row && row.id) || SETTINGS_ID,
    alerts,
    myLevels: alerts,
    settings: row && row.settings_json != null ? row.settings_json : null,
    updatedAt: row && row.updated_at ? row.updated_at : null,
  };
}

exports.main = async (event) => {
  const http = isHttpTrigger(event);
  try {
    const method = httpMethod(event);
    if (method === "OPTIONS") {
      return http ? httpResponse(204, "") : { ok: true };
    }
    if (method === "PUT" || method === "POST") {
      const body = parseBody(event);
      const alerts = normalizeAlerts(body.alerts != null ? body.alerts : body.myLevels);
      const settings = body.settings != null && typeof body.settings === "object" ? body.settings : null;
      await upsertSettings(alerts, settings);
      const row = await loadSettings();
      const payload = toPayload(row || { id: SETTINGS_ID, alerts_json: alerts, settings_json: settings, updated_at: new Date().toISOString() });
      return http ? httpResponse(200, payload) : payload;
    }
    // GET — never wipe existing DB row with empty seed
    const q = (event && (event.queryStringParameters || event.query || {})) || {};
    const wantDebug = String(q.debug || "") === "1";
    const sql = `SELECT id, alerts_json, settings_json, updated_at FROM jinjian_user_settings WHERE id='${SETTINGS_ID}' LIMIT 1;`;
    const raw = await executeSql(sql);
    if (wantDebug) {
      const keys = raw && typeof raw === "object" ? Object.keys(raw) : [];
      const payload = {
        ok: true,
        debug: true,
        keys,
        sample: raw,
        parsed: parseSelectRow(raw),
      };
      return http ? httpResponse(200, payload) : payload;
    }
    const row = parseSelectRow(raw);
    if (!row) {
      // Fallback: try positional decode if Rows looks like [[id, alerts, settings, updated]]
      const rows = (raw && (raw.Rows || raw.rows)) || [];
      if (rows.length && Array.isArray(rows[0]) && rows[0].length >= 2) {
        const fallback = {
          id: rows[0][0],
          alerts_json: parseJsonField(rows[0][1]),
          settings_json: parseJsonField(rows[0][2]),
          updated_at: rows[0][3],
        };
        const payload = toPayload(fallback);
        return http ? httpResponse(200, payload) : payload;
      }
      const payload = toPayload({ id: SETTINGS_ID, alerts_json: SEED_ALERTS, settings_json: null, updated_at: null });
      return http ? httpResponse(200, payload) : payload;
    }
    const payload = toPayload(row);
    return http ? httpResponse(200, payload) : payload;
  } catch (error) {
    const payload = { ok: false, error: String(error && error.message ? error.message : error) };
    return http ? httpResponse(500, payload) : payload;
  }
};
