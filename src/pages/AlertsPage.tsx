import { useState } from "react";
import { AlertEditor } from "../components/AlertEditor.tsx";
import { AlertList } from "../components/AlertList.tsx";
import { Button } from "@/components/ui/button";
import type { PriceAlert } from "../data/alerts.ts";

export function AlertsPage({
  alerts,
  price,
  onCreate,
  onRemove,
}: {
  alerts: PriceAlert[];
  price: number;
  onCreate: (alert: PriceAlert) => void;
  onRemove: (id: string) => void;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">价位账本</p>
          <h1 className="font-price mt-2 text-3xl">到了再看，不到就放着</h1>
        </div>
        <AlertEditor count={alerts.length} onCreate={onCreate} />
      </header>
      <p className="text-sm leading-relaxed text-muted-foreground">
        买入目标在现价之下，卖出目标在现价之上。差距不足 0.8% 会标成接近，穿过目标会标成已到价。
      </p>
      <AlertList alerts={alerts} price={price} onRemove={onRemove} />
      <section className="panel">
        <p className="kicker">系统通知</p>
        {permission === "unsupported" && (
          <p className="mt-2 text-sm text-muted-foreground">这个浏览器不支持通知。价位状态仍会显示在列表里。</p>
        )}
        {permission === "granted" && (
          <p className="mt-2 text-sm text-muted-foreground">已允许。某个目标第一次到价时，会响一次，不会自动下单。</p>
        )}
        {permission === "denied" && (
          <p className="mt-2 text-sm text-muted-foreground">通知被浏览器拒绝了。仍然可以在这页看到已到价。</p>
        )}
        {permission === "default" && (
          <Button type="button" className="mt-3 h-11" onClick={() => void enable()}>
            允许到价通知
          </Button>
        )}
      </section>
    </div>
  );
}
