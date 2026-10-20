export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cny(value: number, digits = 2): string {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function signedNumber(value: number, digits = 2): string {
  const body = cny(Math.abs(value), digits);
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

export function signedPct(value: number): string {
  const body = `${(Math.abs(value) * 100).toFixed(2)}%`;
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return body;
}

export function unsignedPct(value: number): string {
  return `${(Math.abs(value) * 100).toFixed(2)}%`;
}

export function kg(value: number): string {
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 千克`;
}

export function cnDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function cnMonthDay(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function weekdayLabel(iso: string): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return names[day] ?? "";
}

export function clockLabel(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);
}

export function sourceLabel(source: "published" | "synthetic" | "live", customQuote = false): string {
  if (customQuote) return "接口日线";
  if (source === "published") return "公开摘录";
  if (source === "live") return "接口";
  return "演示补齐";
}
