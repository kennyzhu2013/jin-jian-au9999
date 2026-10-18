import { demoMarket } from "../src/data/demoSeries.ts";
import { analyze } from "../src/strategy/engine.ts";
import { cny, cnMonthDay } from "../src/lib/format.ts";

const market = demoMarket();
const analysis = analyze(market.bars);
const last = market.bars.at(-1);
console.log(
  [
    `最后一根 ${last?.date} 收 ${last ? cny(last.close) : "-"}`,
    `状态 ${analysis.regime.label} 效率比 ${analysis.regime.efficiency.toFixed(3)}`,
    `今日 ${analysis.today.strategy} ${analysis.today.side} fresh=${analysis.today.fresh}`,
    analysis.today.reason,
    `待命 ${analysis.standby.strategy} ${analysis.standby.side}`,
    `最近信号 ${analysis.latestTrade ? `${cnMonthDay(analysis.latestTrade.date)} ${analysis.latestTrade.strategy} ${analysis.latestTrade.side} ${cny(analysis.latestTrade.referencePrice)}` : "无"}`,
    `zoneStillOpen=${analysis.zoneStillOpen}`,
    "---- history ----",
    ...analysis.history.slice(-12).map((item) => `${item.date} ${item.strategy} ${item.side} ${cny(item.referencePrice)}`),
  ].join("\n"),
);
