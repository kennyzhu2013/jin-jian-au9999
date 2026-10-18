import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dismissInstallHint, loadInstallHintDismissed } from "../data/storage.ts";

export function InstallCard({
  installed,
  canPrompt,
  onPrompt,
}: {
  installed: boolean;
  canPrompt: boolean;
  onPrompt: () => void;
}) {
  const [dismissed, setDismissed] = useState(() => loadInstallHintDismissed());
  if (installed || dismissed) return null;

  return (
    <section className="panel">
      <p className="kicker">放到主屏幕</p>
      <p className="mt-2 text-sm leading-relaxed">
        用手机浏览器打开后，可以装成一个全屏应用。iPhone 请用 Safari：分享，再点「添加到主屏幕」。Android 用 Chrome：菜单里选「安装应用」或「添加到主屏幕」。
      </p>
      <div className="mt-3 flex gap-2">
        {canPrompt && (
          <Button type="button" className="h-11" onClick={onPrompt}>
            安装
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => {
            dismissInstallHint();
            setDismissed(true);
          }}
        >
          知道了
        </Button>
      </div>
    </section>
  );
}
