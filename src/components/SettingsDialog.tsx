import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PUBLISHED_RANGE } from "../data/demoSeries.ts";
import { endpointError } from "../data/feed.ts";
import { DEFAULT_NEWS_ENDPOINT, type Settings as FeedSettings } from "../data/storage.ts";
import type { MarketSnapshot } from "../data/types.ts";
import { cnMonthDay } from "../lib/format.ts";
import { customQuoteCaption, customQuoteConfigured, customQuoteConnected } from "../lib/quoteCopy.ts";

export function SettingsDialog({
  settings,
  onChange,
  onReload,
  loading,
  workerReady,
  snapshot,
}: {
  settings: FeedSettings;
  onChange: (settings: FeedSettings) => void;
  onReload: () => void;
  loading: boolean;
  workerReady: boolean;
  snapshot: MarketSnapshot;
}) {
  const problem = settings.source === "http" ? endpointError(settings.endpoint) : null;
  const newsProblem = settings.newsSource === "http" ? endpointError(settings.newsEndpoint) : null;
  const liveQuote = customQuoteConnected(settings, snapshot);
  const customEndpoint = customQuoteConfigured(settings);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="size-11" aria-label="行情来源、消息来源和离线说明">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>行情与消息</DialogTitle>
          <DialogDescription>
            演示行情和演示消息都可以离线使用。自定义接口按下面的 JSON 接入，不需要密钥也能先跑通示例。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["demo", "演示数据"],
              ["http", "自定义接口"],
            ] as const
          ).map(([source, label]) => (
            <Button
              key={source}
              type="button"
              variant={settings.source === source ? "default" : "outline"}
              className="h-11"
              aria-pressed={settings.source === source}
              onClick={() => onChange({ ...settings, source })}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endpoint">接口地址</Label>
          <Input
            id="endpoint"
            value={settings.endpoint}
            className="h-11"
            spellCheck={false}
            onChange={(event) => onChange({ ...settings, endpoint: event.target.value })}
          />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {settings.source === "demo"
              ? "演示模式下不会请求这个地址。切到自定义接口后，默认会读取站内的 /sample-feed.json。"
              : "浏览器会直接请求这个地址，所以它必须允许跨域，或放在本站。"}
          </p>
          {problem && <p className="text-sm text-up">{problem}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["demo", "演示消息"],
              ["http", "消息接口"],
            ] as const
          ).map(([source, label]) => (
            <Button
              key={source}
              type="button"
              variant={settings.newsSource === source ? "default" : "outline"}
              className="h-11"
              aria-pressed={settings.newsSource === source}
              onClick={() => onChange({ ...settings, newsSource: source })}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="news-endpoint">消息地址</Label>
          <Input
            id="news-endpoint"
            value={settings.newsEndpoint}
            className="h-11"
            spellCheck={false}
            onChange={(event) => onChange({ ...settings, newsEndpoint: event.target.value })}
          />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {settings.newsSource === "demo"
              ? `演示消息对齐到最近一根日线，不会请求这个地址。切到消息接口后，默认请求 ${DEFAULT_NEWS_ENDPOINT}，也可以改成自己的地址。`
              : "请求这个地址。若构建时设置了 VITE_NEWS_API_KEY，会带上 Bearer 令牌。"}
          </p>
          {newsProblem && <p className="text-sm text-up">{newsProblem}</p>}
        </div>
        <Button
          type="button"
          className="h-11"
          disabled={loading || Boolean(problem) || Boolean(newsProblem)}
          onClick={onReload}
        >
          {loading ? "正在拉取" : "重新拉取"}
        </Button>
        <div className="space-y-2 rounded-xl bg-black/25 p-3 text-[12px] leading-relaxed text-muted-foreground">
          <p>
            {liveQuote
              ? customQuoteCaption(snapshot)
              : customEndpoint
                ? "已选择自定义行情接口。日线与实时价以该地址返回的数据为准。"
                : `公开摘录覆盖 ${cnMonthDay(PUBLISHED_RANGE.start)} 至 ${cnMonthDay(PUBLISHED_RANGE.end)}。更早的日子是固定种子补齐的，图上颜色更淡。${cnMonthDay(PUBLISHED_RANGE.end)} 之后没有编造成交。`}
          </p>
          <p>离线壳：{workerReady ? "服务工作线程已就绪，上次打开过的页面可以离线再开。" : "正在注册服务工作线程。"}</p>
          <p>最近一次成功的行情和消息都会记在这台设备里。接口失败或断网时，仪表仍显示上次的价格；消息没有缓存时回到演示语料。</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
