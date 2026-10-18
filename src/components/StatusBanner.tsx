import type { SnapshotMode } from "../data/types.ts";

export function StatusBanner({
  offline,
  warning,
  mode,
}: {
  offline: boolean;
  warning: string | null;
  mode: SnapshotMode;
}) {
  if (!offline && !warning) return null;
  const text =
    warning ??
    (mode === "demo"
      ? "网络已断开。演示行情在应用里，仍可查看最近一根日线。"
      : "网络已断开，显示上次看到的价格。");
  return (
    <p role="status" className="border-b border-gold/20 bg-[#2a2116] px-4 py-2 text-[12px] leading-relaxed text-gold-soft">
      {text}
    </p>
  );
}
