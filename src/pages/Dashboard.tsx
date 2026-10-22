import { AlertEditor } from "../components/AlertEditor.tsx";
import { AlertList } from "../components/AlertList.tsx";
import { CandleChart } from "../components/CandleChart.tsx";
import { DigestView } from "../components/DigestView.tsx";
import { InstallCard } from "../components/InstallCard.tsx";
import { OutlookCard } from "../components/OutlookCard.tsx";
import { PriceHero } from "../components/PriceHero.tsx";
import { SignalCard } from "../components/SignalCard.tsx";
import type { PriceAlert } from "../data/alerts.ts";
import { PUBLISHED_RANGE } from "../data/demoSeries.ts";
import { cnMonthDay } from "../lib/format.ts";
import { customQuoteCaption } from "../lib/quoteCopy.ts";
import { REGIME_LABEL, SIDE_LABEL, STRATEGY_LABEL } from "../strategy/params.ts";
import { signalHeadline } from "../strategy/present.ts";
import type { Digest } from "../strategy/digest.ts";
import type { Outlook } from "../strategy/outlook.ts";
import type { Analysis } from "../strategy/types.ts";
import type { MarketSnapshot } from "../data/types.ts";

export function Dashboard({
  snapshot,
  analysis,
  outlook,
  digest,
  alerts,
  onCreate,
  onRemove,
  installed,
  canPrompt,
  onPrompt,
  customQuote,
}: {
  snapshot: MarketSnapshot;
  analysis: Analysis;
  outlook: Outlook;
  digest: Digest;
  alerts: PriceAlert[];
  onCreate: (alert: PriceAlert) => void;
  onRemove: (id: string) => void;
  installed: boolean;
  canPrompt: boolean;
  onPrompt: () => void;
  customQuote: boolean;
}) {
  const headline = signalHeadline(analysis);

  return (
    <div className="space-y-4">
      <PriceHero quote={snapshot.quote} />
      <OutlookCard outlook={outlook} />
      <section className="panel flex items-center justify-between gap-3">
        <div>
          <p className="kicker">市场状态</p>
          <p className="mt-1 text-2xl font-medium">{REGIME_LABEL[analysis.regime.kind]}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">今日策略</p>
          <p className="mt-1 text-sm">
            {STRATEGY_LABEL[analysis.today.strategy]} · {SIDE_LABEL[analysis.today.side]}
          </p>
        </div>
      </section>
      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">{analysis.regime.reason}</p>
      <SignalCard eyebrow={headline.eyebrow} signal={headline.signal} note={headline.note} />
      <CandleChart bars={snapshot.bars} alerts={alerts} customQuote={customQuote} />
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {customQuote
          ? customQuoteCaption(snapshot)
          : `${cnMonthDay(PUBLISHED_RANGE.start)} 至 ${cnMonthDay(PUBLISHED_RANGE.end)} 为积存金口径日线样本（每日开高低收），更早为演示补齐。实时价接上后会落到当日 K 线。`}
      </p>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">我的价位</h2>
          <AlertEditor count={alerts.length} onCreate={onCreate} />
        </div>
        <AlertList alerts={alerts} price={snapshot.quote.price} onRemove={onRemove} />
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">晚报摘要</h2>
          <a href="#/digest" className="text-sm text-gold">
            看完整晚报
          </a>
        </div>
        <DigestView digest={digest} compact />
      </section>
      <InstallCard installed={installed} canPrompt={canPrompt} onPrompt={onPrompt} />
    </div>
  );
}
