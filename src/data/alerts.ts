import { cny, unsignedPct } from "../lib/format.ts";

export type AlertSide = "buy" | "sell";

export type PriceAlert = {
  id: string;
  side: AlertSide;
  price: number;
  note: string;
  createdAt: string;
};

export type AlertState = "hit" | "near" | "away";

const NEAR = 0.008;

export function alertState(alert: PriceAlert, price: number): AlertState {
  if (alert.side === "buy") {
    if (price <= alert.price) return "hit";
    if ((price - alert.price) / price <= NEAR) return "near";
    return "away";
  }
  if (price >= alert.price) return "hit";
  if ((alert.price - price) / price <= NEAR) return "near";
  return "away";
}

export function alertDistance(alert: PriceAlert, price: number): string {
  if (alert.side === "buy") {
    if (price <= alert.price) return "现价已到买入目标";
    const gap = price - alert.price;
    return `还要下跌 ${cny(gap)}（${unsignedPct(gap / price)}）`;
  }
  if (price >= alert.price) return "现价已到卖出目标";
  const gap = alert.price - price;
  return `还要上涨 ${cny(gap)}（${unsignedPct(gap / price)}）`;
}

export function alertStateLabel(state: AlertState): string {
  if (state === "hit") return "已到价";
  if (state === "near") return "接近";
  return "未到";
}
