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
export const DEFAULT_NEWS_ENDPOINT = "/sample-news.json";

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
    price: 948,
    note: "九月中段平台",
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
