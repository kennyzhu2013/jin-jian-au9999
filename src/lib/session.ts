export type SessionKind = "day" | "night" | "closed" | "weekend";

type ShanghaiClock = {
  weekday: string;
  minutes: number;
};

export function shanghaiClock(now = new Date()): ShanghaiClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday ?? "",
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Au99.99 日盘 09:00–15:30，夜盘 19:50–次日 02:30，周五夜盘延续到周六凌晨。 */
export function sessionKind(now = new Date()): SessionKind {
  const { weekday, minutes } = shanghaiClock(now);
  const early = minutes < 2 * 60 + 30;
  const day = minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  const night = minutes >= 19 * 60 + 50;

  if (weekday === "Sun") return "weekend";
  if (weekday === "Sat") return early ? "night" : "weekend";
  if (weekday === "Mon" && early) return "closed";
  if (day) return "day";
  if (night || early) return "night";
  return "closed";
}

export function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function sessionLabel(kind: SessionKind): string {
  if (kind === "day") return "日盘交易中";
  if (kind === "night") return "夜盘交易中";
  if (kind === "weekend") return "周末休市";
  return "已收盘";
}
