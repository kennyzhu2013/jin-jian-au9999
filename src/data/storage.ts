import type { MarketSnapshot } from "./types.ts";
import type { PriceAlert } from "./alerts.ts";

const SNAPSHOT_KEY = "jinjian.snapshot.v1";
const ALERTS_KEY = "jinjian.alerts.v1";
const SETTINGS_KEY = "jinjian.settings.v1";
const HINT_KEY = "jinjian.installHint.v1";

export type Settings = {
  source: "demo" | "http";
  endpoint: string;
  newsSource: "demo" | "http";
  newsEndpoint: string;
};

export const DEFAULT_ENDPOINT = "/sample-feed.json";

/** CloudBase HTTPSERVICE default domain (APIs live here). */
export const CLOUDBASE_HTTP_ORIGIN =
  "https://testgold-d6g8l28m85a3d21aa-1512175549.ap-shanghai.app.tcloudbase.com";

/**
 * Resolve an API path for browser fetch.
 * - Same-origin when the page is already on the HTTPSERVICE host.
 * - Otherwise absolute HTTPSERVICE URL (needed for webapps host and file:// opens
 *   after default-domain Content-Disposition: attachment downloads).
 */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  try {
    if (typeof location !== "undefined" && location.origin === CLOUDBASE_HTTP_ORIGIN) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return `${CLOUDBASE_HTTP_ORIGIN}${p}`;
}

/** 未填写、也未设置 VITE_NEWS_API_URL 时使用的生产消息代理。不要把上游密钥写进前端。 */
export const DEFAULT_NEWS_ENDPOINT = `${CLOUDBASE_HTTP_ORIGIN}/api/news`;

function envNewsEndpoint(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_NEWS_API_URL;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return DEFAULT_NEWS_ENDPOINT;
}

export const DEFAULT_SETTINGS: Settings = {
  source: "demo",
  endpoint: DEFAULT_ENDPOINT,
  newsSource: "demo",
  newsEndpoint: envNewsEndpoint(),
};

/** CloudBase HTTPSERVICE：我的价位（alerts）持久化 */
export const DEFAULT_SETTINGS_API = `${CLOUDBASE_HTTP_ORIGIN}/api/settings`;

function envSettingsApi(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_SETTINGS_API_URL;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  return DEFAULT_SETTINGS_API;
}

function normalizeAlerts(raw: unknown): PriceAlert[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (alert): alert is PriceAlert =>
      Boolean(alert) &&
      (alert.side === "buy" || alert.side === "sell") &&
      typeof alert.price === "number" &&
      Number.isFinite(alert.price),
  );
}

/** 从 CloudBase 拉取上次保存的我的价位；失败返回 null（调用方用 localStorage）。 */
export async function fetchRemoteAlerts(): Promise<PriceAlert[] | null> {
  try {
    const response = await fetch(envSettingsApi(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    if (!json || typeof json !== "object") return null;
    const obj = json as { ok?: boolean; alerts?: unknown; myLevels?: unknown };
    if (obj.ok === false) return null;
    const alerts = normalizeAlerts(obj.alerts ?? obj.myLevels);
    return alerts;
  } catch {
    return null;
  }
}

/** 把我的价位写回 CloudBase；失败静默（localStorage 仍是缓存）。 */
export async function pushRemoteAlerts(alerts: PriceAlert[]): Promise<boolean> {
  try {
    const response = await fetch(envSettingsApi(), {
      method: "PUT",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ alerts }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const SEED_ALERTS: PriceAlert[] = [
  {
    id: "seed-buy",
    side: "buy",
    price: 900,
    note: "整数关口",
    createdAt: "2026-10-09T15:30:00+08:00",
  },
  {
    id: "seed-sell",
    side: "sell",
    price: 910,
    note: "短线压力位",
    createdAt: "2026-10-09T15:30:00+08:00",
  },
];

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const stored = readJson<Partial<Settings>>(SETTINGS_KEY);
  if (!stored) return DEFAULT_SETTINGS;
  return {
    source: stored.source === "http" ? "http" : "demo",
    endpoint: typeof stored.endpoint === "string" && stored.endpoint.trim() ? stored.endpoint : DEFAULT_ENDPOINT,
    newsSource: stored.newsSource === "http" ? "http" : "demo",
    newsEndpoint:
      typeof stored.newsEndpoint === "string" && stored.newsEndpoint.trim()
        ? stored.newsEndpoint
        : envNewsEndpoint(),
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadAlerts(): PriceAlert[] {
  const stored = readJson<PriceAlert[]>(ALERTS_KEY);
  if (!stored) return SEED_ALERTS;
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (alert) =>
      alert &&
      (alert.side === "buy" || alert.side === "sell") &&
      typeof alert.price === "number" &&
      Number.isFinite(alert.price),
  );
}

export function saveAlerts(alerts: PriceAlert[]): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function loadSnapshot(): MarketSnapshot | null {
  const stored = readJson<MarketSnapshot>(SNAPSHOT_KEY);
  if (!stored?.quote || !Array.isArray(stored.bars) || stored.bars.length === 0) return null;
  return stored;
}

export function saveSnapshot(snapshot: MarketSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function loadInstallHintDismissed(): boolean {
  return localStorage.getItem(HINT_KEY) === "1";
}

export function dismissInstallHint(): void {
  localStorage.setItem(HINT_KEY, "1");
}
