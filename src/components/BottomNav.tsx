import { Bell, LineChart, Newspaper, ArrowLeftRight } from "lucide-react";
import type { RouteId } from "../hooks/useHashRoute.ts";

const ITEMS: { id: RouteId; href: string; label: string; icon: typeof Bell }[] = [
  { id: "market", href: "#/market", label: "行情", icon: LineChart },
  { id: "signals", href: "#/signals", label: "信号", icon: ArrowLeftRight },
  { id: "digest", href: "#/digest", label: "晚报", icon: Newspaper },
  { id: "alerts", href: "#/alerts", label: "提醒", icon: Bell },
];

export function BottomNav({ route }: { route: RouteId }) {
  return (
    <nav
      aria-label="主导航"
      className="shrink-0 border-t border-white/10 bg-[#0e0c0a] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = route === item.id;
          const Icon = item.icon;
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "text-gold" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
