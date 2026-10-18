import type { Bar } from "../data/types.ts";

export function sma(values: number[], end: number, period: number): number | null {
  const start = end - period + 1;
  if (start < 0 || end >= values.length) return null;
  let sum = 0;
  for (let index = start; index <= end; index += 1) sum += values[index] ?? 0;
  return sum / period;
}

export function stdev(values: number[], end: number, period: number): number | null {
  const mean = sma(values, end, period);
  if (mean == null) return null;
  const start = end - period + 1;
  let acc = 0;
  for (let index = start; index <= end; index += 1) {
    const delta = (values[index] ?? 0) - mean;
    acc += delta * delta;
  }
  return Math.sqrt(acc / period);
}

export function efficiencyRatio(values: number[], end: number, period: number): number | null {
  const start = end - period;
  if (start < 0 || end >= values.length) return null;
  const net = Math.abs((values[end] ?? 0) - (values[start] ?? 0));
  let path = 0;
  for (let index = start + 1; index <= end; index += 1) {
    path += Math.abs((values[index] ?? 0) - (values[index - 1] ?? 0));
  }
  if (path === 0) return 0;
  return net / path;
}

export function extreme(
  bars: Bar[],
  end: number,
  period: number,
  field: "high" | "low",
): number | null {
  const start = end - period + 1;
  if (start < 0 || end >= bars.length) return null;
  let value = bars[start]?.[field];
  if (value == null) return null;
  for (let index = start + 1; index <= end; index += 1) {
    const next = bars[index]?.[field];
    if (next == null) return null;
    value = field === "high" ? Math.max(value, next) : Math.min(value, next);
  }
  return value;
}

export function bollinger(values: number[], end: number, period: number, mult: number) {
  const mid = sma(values, end, period);
  const deviation = stdev(values, end, period);
  if (mid == null || deviation == null) return null;
  const upper = mid + mult * deviation;
  const lower = mid - mult * deviation;
  return { mid, upper, lower, width: mid === 0 ? 0 : (upper - lower) / mid };
}
