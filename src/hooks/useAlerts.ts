import { useCallback, useEffect, useState } from "react";
import { alertState, type PriceAlert } from "../data/alerts.ts";
import { fetchRemoteAlerts, loadAlerts, pushRemoteAlerts, saveAlerts } from "../data/storage.ts";

const NOTIFIED_KEY = "jinjian.notified.v1";

function readNotified(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(NOTIFIED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function useAlerts(price: number) {
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => loadAlerts());

  const write = useCallback((next: PriceAlert[]) => {
    setAlerts(next);
    saveAlerts(next);
    void pushRemoteAlerts(next);
  }, []);

  const add = useCallback(
    (alert: PriceAlert) => {
      write([alert, ...loadAlerts().filter((item) => item.id !== alert.id)].slice(0, 12));
    },
    [write],
  );

  const remove = useCallback(
    (id: string) => {
      write(loadAlerts().filter((item) => item.id !== id));
    },
    [write],
  );

  // 页面打开：从 CloudBase 拉上次保存的我的价位，覆盖本地缓存
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await fetchRemoteAlerts();
      if (cancelled || remote == null) return;
      saveAlerts(remote);
      setAlerts(remote);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const seen = new Set(readNotified());
    let changed = false;
    for (const alert of alerts) {
      if (alertState(alert, price) !== "hit") continue;
      const key = `${alert.id}:${Math.round(price)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changed = true;
      const title = alert.side === "buy" ? "金鉴 · 买入价已到" : "金鉴 · 卖出价已到";
      const body = `Au99.99 现报 ${price.toFixed(2)}，你的${alert.side === "buy" ? "买入" : "卖出"}目标 ${alert.price.toFixed(2)}。只是提醒，不会下单。`;
      void new Notification(title, { body, lang: "zh-CN" });
    }
    if (changed) sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen]));
  }, [alerts, price]);

  return { alerts, add, remove };
}
