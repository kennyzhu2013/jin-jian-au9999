import { useCallback, useEffect, useRef, useState } from "react";
import { demoMarket } from "../data/demoSeries.ts";
import { loadMarket } from "../data/feed.ts";
import { loadSnapshot, saveSnapshot, type Settings } from "../data/storage.ts";
import type { MarketSnapshot } from "../data/types.ts";

export function useMarket(settings: Settings) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(() => {
    if (settings.source === "demo") return demoMarket();
    return loadSnapshot() ?? demoMarket();
  });
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const applyFailure = useCallback((message: string) => {
    const cached = loadSnapshot();
    if (settings.source === "http" && cached) {
      setSnapshot({ ...cached, mode: "cached" });
      setWarning(`${message} 下面仍是上次看到的价格。`);
      return;
    }
    const fallback = demoMarket();
    saveSnapshot(fallback);
    setSnapshot(fallback);
    setWarning(settings.source === "demo" ? null : `${message} 已改回演示行情。`);
  }, [settings.source]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadMarket(settings);
      saveSnapshot(next);
      setSnapshot(next);
      setWarning(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "行情没有更新。";
      applyFailure(message);
    } finally {
      setLoading(false);
    }
  }, [applyFailure, settings]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      try {
        const next = await loadMarket(settingsRef.current);
        if (cancelled) return;
        saveSnapshot(next);
        setSnapshot(next);
        setWarning(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "行情没有更新。";
        applyFailure(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 地址在输入时不要每次都请求，改用来源切换和「重新拉取」。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFailure, settings.source]);

  return { snapshot, warning, loading, reload };
}
