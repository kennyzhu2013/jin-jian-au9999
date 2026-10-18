import { DigestView } from "../components/DigestView.tsx";
import type { Digest } from "../strategy/digest.ts";

export function DigestPage({ digest }: { digest: Digest }) {
  return (
    <div className="space-y-4">
      <DigestView digest={digest} />
      <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
        晚报按最近一根日线生成，适合收盘后看一眼。它不是盘中喊单，也不会在休市时假装还有新成交。
      </p>
    </div>
  );
}
