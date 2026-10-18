import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomNav } from "./components/BottomNav.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { StatusBanner } from "./components/StatusBanner.tsx";
import { useAlerts } from "./hooks/useAlerts.ts";
import { useHashRoute } from "./hooks/useHashRoute.ts";
import { useInstall } from "./hooks/useInstall.ts";
import { useMarket } from "./hooks/useMarket.ts";
import { useNews } from "./hooks/useNews.ts";
import { useOnline } from "./hooks/useOnline.ts";
import { AlertsPage } from "./pages/AlertsPage.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { DigestPage } from "./pages/DigestPage.tsx";
import { SignalsPage } from "./pages/SignalsPage.tsx";
import { loadSettings, saveSettings, type Settings } from "./data/storage.ts";
import { analyze } from "./strategy/engine.ts";
import { buildDigest } from "./strategy/digest.ts";
import { buildOutlook } from "./strategy/outlook.ts";
import { REGIME_LABEL } from "./strategy/params.ts";

const TITLES = {
  market: "行情",
  signals: "信号",
  digest: "晚报",
  alerts: "提醒",
} as const;

export default function App() {
  const route = useHashRoute();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const online = useOnline();
  const { snapshot, warning, loading, reload } = useMarket(settings);
  const news = useNews(settings);
  const { alerts, add, remove } = useAlerts(snapshot.quote.price);
  const install = useInstall();
  const analysis = useMemo(() => analyze(snapshot.bars), [snapshot.bars]);
  const asOf = snapshot.bars.at(-1)?.date ?? snapshot.quote.time.slice(0, 10);
  const outlook = useMemo(
    () => buildOutlook(analysis, news.items, asOf, news.mode),
    [analysis, asOf, news.items, news.mode],
  );
  const digest = useMemo(
    () => buildDigest(snapshot, analysis, alerts, outlook),
    [alerts, analysis, outlook, snapshot],
  );
  const refreshing = loading || news.loading;
  const banner = [warning, news.warning].filter(Boolean).join(" ") || null;

  const refresh = () => {
    void reload();
    void news.reload();
  };

  useEffect(() => {
    document.title = `金鉴 · ${TITLES[route]}`;
  }, [route]);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  const modeLabel = snapshot.mode === "http" ? "接口" : snapshot.mode === "cached" ? "缓存" : "演示";

  return (
    <div className="h-dvh overflow-hidden md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden h-dvh flex-col justify-between border-r border-white/10 px-8 py-10 md:flex">
        <div>
          <p className="kicker">Au9999</p>
          <p className="font-price mt-3 text-5xl">金鉴</p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            个人纸黄金参谋。技术状态在趋势跟踪和高抛低吸之间切换，综合建议再合上消息偏向。买卖只写在账上。
          </p>
          <p className="mt-6 text-sm text-gold-soft">此刻 {REGIME_LABEL[analysis.regime.kind]}</p>
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          信号是规则演算，不构成投资建议，也不连接任何银行、券商或交易所账户。
        </p>
      </aside>
      <div className="mx-auto flex h-dvh min-h-0 w-full max-w-[520px] flex-col md:max-w-[680px]">
        <header className="shrink-0 border-b border-white/10 bg-[#0e0c0a]/95 px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-price text-2xl leading-none">金鉴</p>
              <p className="mt-1 text-[11px] text-muted-foreground">纸黄金参谋 · {modeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="刷新行情和消息"
                disabled={refreshing}
                onClick={refresh}
              >
                <RefreshCw className={refreshing ? "motion-safe:animate-spin" : undefined} />
              </Button>
              <SettingsDialog
                settings={settings}
                onChange={updateSettings}
                onReload={refresh}
                loading={refreshing}
                workerReady={install.workerReady}
              />
            </div>
          </div>
        </header>
        <StatusBanner offline={!online} warning={banner} mode={snapshot.mode} />
        <main id="content" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {route === "market" && (
            <Dashboard
              snapshot={snapshot}
              analysis={analysis}
              outlook={outlook}
              digest={digest}
              alerts={alerts}
              onCreate={add}
              onRemove={remove}
              installed={install.installed}
              canPrompt={install.canPrompt}
              onPrompt={() => void install.promptInstall()}
            />
          )}
          {route === "signals" && <SignalsPage analysis={analysis} outlook={outlook} />}
          {route === "digest" && <DigestPage digest={digest} />}
          {route === "alerts" && (
            <AlertsPage alerts={alerts} price={snapshot.quote.price} onCreate={add} onRemove={remove} />
          )}
        </main>
        <p className="shrink-0 px-4 py-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          信号只供个人复盘，不构成投资建议，也不连接任何交易账户。
        </p>
        <BottomNav route={route} />
      </div>
    </div>
  );
}
