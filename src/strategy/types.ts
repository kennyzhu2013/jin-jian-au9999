import type { REGIME_LABEL, SIDE_LABEL, STRATEGY_LABEL } from "./params.ts";

export type RegimeKind = keyof typeof REGIME_LABEL;
export type StrategyId = keyof typeof STRATEGY_LABEL;
export type Side = keyof typeof SIDE_LABEL;

export type RegimeSnapshot = {
  kind: RegimeKind;
  label: string;
  efficiency: number;
  reason: string;
  backdrop: string;
};

export type Signal = {
  id: string;
  date: string;
  side: Side;
  strategy: StrategyId;
  regime: RegimeKind;
  referencePrice: number;
  reason: string;
  riskNote: string;
  fresh: boolean;
};

export type Levels = {
  maFast: number;
  maSlow: number;
  upper: number;
  lower: number;
  mid: number;
  priorHigh: number;
  priorLow: number;
  rangeHigh: number;
  rangeLow: number;
  rangePos: number;
  atrBandWidth: number;
};

export type Analysis = {
  ready: boolean;
  regime: RegimeSnapshot;
  today: Signal;
  standby: Signal;
  latestTrade: Signal | null;
  /** 上一笔买卖的方向今天仍然成立，所以不重复发信号。 */
  zoneStillOpen: boolean;
  history: Signal[];
  levels: Levels | null;
};
