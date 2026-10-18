import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_NEWS } from "../data/news.ts";
import type { NewsItem } from "../data/news.ts";
import { cachedNews, loadNews } from "../data/newsFeed.ts";
import type { Settings } from "../data/storage.ts";

export function useNews(settings: Settings) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [items, setItems] = useState<NewsItem[]>(() => (settings.newsSource === "http" ? cachedNews() ?? DEMO_NEWS : DEMO_NEWS));
  const [mode, setMode] = useState<"demo" | "http" | "cached">(settings.newsSource === "http" ? "cached" : "demo");
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    const current = settingsRef.current;
    setLoading(true);
    try {
      const next = await loadNews(current);
      setItems(next.items);
      setMode(next.mode);
      setWarning(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "消息没有更新。";
      const cached = cachedNews();
      if (current.newsSource === "http" && cached) {
        setItems(cached);
        setMode("cached");
        setWarning(`${message} 仍显示上次的消息。`);
      } else {
        setItems(DEMO_NEWS);
        setMode("demo");
        setWarning(current.newsSource === "demo" ? null : `${message} 已改回演示消息。`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const next = await loadNews(settingsRef.current);
        if (cancelled) return;
        setItems(next.items);
        setMode(next.mode);
        setWarning(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "消息没有更新。";
        const cached = cachedNews();
        if (settingsRef.current.newsSource === "http" && cached) {
          setItems(cached);
          setMode("cached");
          setWarning(`${message} 仍显示上次的消息。`);
        } else {
          setItems(DEMO_NEWS);
          setMode("demo");
          setWarning(settingsRef.current.newsSource === "demo" ? null : `${message} 已改回演示消息。`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.newsSource]);

  return { items, mode, warning, loading, reload };
}
