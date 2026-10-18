import type { MarketSnapshot } from "../data/types.ts";
import { cny, cnMonthDay, kg, signedNumber, signedPct, weekdayLabel } from "../lib/format.ts";
import { sessionKind, sessionLabel, shanghaiDate } from "../lib/session.ts";
import { STRATEGY_LABEL } from "./params.ts";
import type { Outlook } from "./outlook.ts";
import type { Analysis } from "./types.ts";
import { alertDistance, type PriceAlert } from "../data/alerts.ts";

export type DigestStat = { label: string; value: string };

export type Digest = {
  kicker: string;
  title: string;
  dateline: string;
  lede: string;
  stats: DigestStat[];
  sections: { heading: string; body: string }[];
};

export function buildDigest(
  snapshot: MarketSnapshot,
  analysis: Analysis,
  alerts: PriceAlert[],
  outlook: Outlook,
  now = new Date(),
): Digest {
  const last = snapshot.bars.at(-1);
  const prev = snapshot.bars.at(-2);
  const close = snapshot.quote.price;
  const prevClose = snapshot.quote.prevClose;
  const change = close - prevClose;
  const changePct = prevClose === 0 ? 0 : change / prevClose;
  const date = last?.date ?? snapshot.quote.time.slice(0, 10);
  const session = sessionLabel(sessionKind(now));
  const barIsToday = date === shanghaiDate(now);
  const dayWord = barIsToday ? "今天" : "最近一个交易日";
  const trade = analysis.latestTrade;
  const activeName = STRATEGY_LABEL[analysis.today.strategy];
  const standbyName = STRATEGY_LABEL[analysis.standby.strategy];

  let lede = `${analysis.regime.label}。${analysis.regime.backdrop}`;
  if (analysis.today.fresh && analysis.today.side !== "watch") {
    lede = `${dayWord}触发${analysis.today.side === "buy" ? "买入" : "卖出"}参考。${analysis.today.reason}`;
  } else if (analysis.zoneStillOpen && trade) {
    lede = `${cnMonthDay(trade.date)}的${trade.side === "buy" ? "买入" : "卖出"}条件还在，不重复发信号。${analysis.regime.backdrop}`;
  } else if (change > 0 && analysis.regime.kind === "trend_down") {
    lede = `收盘反弹 ${signedNumber(change)}，下行趋势还没有被收回，也没有新的破位。${analysis.regime.backdrop}`;
  } else if (change < 0 && analysis.regime.kind === "trend_up") {
    lede = `收盘回落 ${signedNumber(change)}，上行趋势还在，没有新的突破。${analysis.regime.backdrop}`;
  } else if (!analysis.today.fresh) {
    lede = `${analysis.regime.reason}${analysis.regime.backdrop}`;
  }

  const watchBits: string[] = [];
  if (analysis.levels) {
    watchBits.push(
      `趋势看 ${cny(analysis.levels.maFast)} / ${cny(analysis.levels.maSlow)} 两条均线，以及 ${cny(analysis.levels.priorHigh)} 和 ${cny(analysis.levels.priorLow)} 这两个近 20 日边缘。`,
    );
    watchBits.push(
      `区间看布林 ${cny(analysis.levels.lower)} – ${cny(analysis.levels.upper)}。收盘走出这条带，高抛低吸就先停。`,
    );
  }
  if (trade) {
    watchBits.push(
      `账本上最近一笔是 ${cnMonthDay(trade.date)} 的${trade.side === "buy" ? "买入" : "卖出"}，参考价 ${cny(trade.referencePrice)}。`,
    );
  }

  const alertLine =
    alerts.length === 0
      ? "还没有自己的价位。可以设一个想接的低点和想走的高点。"
      : alerts
          .map((alert) => `${alert.side === "buy" ? "买入" : "卖出"} ${cny(alert.price)}，${alertDistance(alert, close)}`)
          .join("；");

  const stats: DigestStat[] = [
    { label: "开盘", value: cny(snapshot.quote.open) },
    { label: "最高", value: cny(snapshot.quote.high) },
    { label: "最低", value: cny(snapshot.quote.low) },
    { label: "涨跌", value: `${signedNumber(change)} · ${signedPct(changePct)}` },
  ];
  if (last?.volume != null) stats.push({ label: "成交量", value: kg(last.volume) });
  if (prev) stats.push({ label: "前收", value: cny(prev.close) });

  return {
    kicker: "金鉴晚报",
    title: `${cnMonthDay(date)} · ${weekdayLabel(date)}`,
    dateline: `${session} · 数据截至 ${cnMonthDay(date)} · Au99.99`,
    lede,
    stats,
    sections: [
      {
        heading: barIsToday ? "今天这根线" : "最近一根日线",
        body: `${dayWord}收于 ${cny(close)} 元/克，振幅 ${cny(snapshot.quote.high - snapshot.quote.low)}。${analysis.today.reason}`,
      },
      {
        heading: "综合建议",
        body: `短线${outlook.short.label}，把握${outlook.short.convictionLabel}；中线${outlook.medium.label}，把握${outlook.medium.convictionLabel}。${outlook.reasons.map((reason) => reason.text).join("")}${outlook.newsNote}${outlook.disclaimer}`,
      },
      {
        heading: "策略怎么分工",
        body: `生效的是${activeName}。${standbyName}在旁边待命：${analysis.standby.reason}`,
      },
      {
        heading: "下一根线看哪里",
        body: watchBits.join(""),
      },
      {
        heading: "你的价位",
        body: `${alertLine}。到价只提醒，不会下单。`,
      },
      {
        heading: "风险",
        body: `${analysis.today.riskNote}这页是规则演算，不是投资建议，也不连接银行或券商。`,
      },
    ],
  };
}
