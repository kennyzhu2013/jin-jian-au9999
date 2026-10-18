import { DEMO_NEWS, normalizeNews, type NewsItem } from "./news.ts";
import { endpointError } from "./feed.ts";
import type { Settings } from "./storage.ts";

const NEWS_KEY = "jinjian.news.v1";

function newsApiKey(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const key = env?.VITE_NEWS_API_KEY;
  return typeof key === "string" ? key.trim() : "";
}

function readCache(): NewsItem[] | null {
  try {
    const raw = localStorage.getItem(NEWS_KEY);
    if (!raw) return null;
    return normalizeNews(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeCache(items: NewsItem[]): void {
  localStorage.setItem(NEWS_KEY, JSON.stringify({ items }));
}

export async function loadNews(settings: Settings): Promise<{ items: NewsItem[]; mode: "demo" | "http" }> {
  if (settings.newsSource !== "http") return { items: DEMO_NEWS, mode: "demo" };
  const problem = endpointError(settings.newsEndpoint);
  if (problem) throw new Error(problem);
  const headers: Record<string, string> = {};
  const key = newsApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(settings.newsEndpoint.trim(), { cache: "no-store", headers });
  if (!response.ok) throw new Error(`消息接口返回 ${response.status}。`);
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("消息接口没有返回 JSON。");
  }
  const items = normalizeNews(payload);
  writeCache(items);
  return { items, mode: "http" };
}

export function cachedNews(): NewsItem[] | null {
  return readCache();
}
