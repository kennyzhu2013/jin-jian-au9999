/** 规则参数集中在这里，界面上的「策略参数」直接读这组数字。 */
export const PARAMS = {
  erLookback: 10,
  erTrend: 0.38,
  erRange: 0.3,
  fast: 10,
  slow: 30,
  donchian: 20,
  band: 20,
  bandMult: 2,
  rangeBuyPos: 0.18,
  rangeSellPos: 0.82,
  slopeLookback: 5,
} as const;

export const STRATEGY_LABEL = {
  trend: "趋势跟踪",
  range: "高抛低吸",
} as const;

export const SIDE_LABEL = {
  buy: "买入",
  sell: "卖出",
  watch: "观望",
} as const;

export const REGIME_LABEL = {
  trend_up: "趋势 · 上行",
  trend_down: "趋势 · 下行",
  range: "震荡",
} as const;
