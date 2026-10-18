export type BarSource = "published" | "synthetic" | "live";

export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source: BarSource;
};

export type Quote = {
  symbol: "Au99.99";
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  time: string;
  sourceLabel: string;
};

export type SnapshotMode = "demo" | "http" | "cached";

export type MarketSnapshot = {
  symbol: "Au99.99";
  bars: Bar[];
  quote: Quote;
  fetchedAt: string;
  mode: SnapshotMode;
};
