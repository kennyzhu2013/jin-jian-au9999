import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AlertSide, PriceAlert } from "../data/alerts.ts";

export function AlertEditor({
  onCreate,
  count,
}: {
  onCreate: (alert: PriceAlert) => void;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<AlertSide>("buy");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSide("buy");
    setPrice("");
    setNote("");
    setError(null);
  };

  const save = () => {
    if (count >= 12) {
      setError("最多留 12 条，先删掉不用的。");
      return;
    }
    const value = Number(price);
    if (!Number.isFinite(value) || value < 100 || value > 5000) {
      setError("价格填 100 到 5000 之间的数字，单位是元/克。");
      return;
    }
    onCreate({
      id: crypto.randomUUID(),
      side,
      price: Math.round(value * 100) / 100,
      note: note.trim().slice(0, 24),
      createdAt: new Date().toISOString(),
    });
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-11 px-4">
          <Plus />
          添加价位
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置价位提醒</DialogTitle>
          <DialogDescription>到价只在这台设备上提示，不会连接任何交易账户。</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["buy", "买入目标"],
              ["sell", "卖出目标"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={side === value ? "default" : "outline"}
              className="h-11"
              aria-pressed={side === value}
              onClick={() => setSide(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="alert-price">价格（元/克）</Label>
          <Input
            id="alert-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder="例如 880"
            value={price}
            aria-invalid={error ? true : undefined}
            className="h-12 text-lg"
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="alert-note">备注，可选</Label>
          <Input
            id="alert-note"
            maxLength={24}
            placeholder="跌到这里再看"
            value={note}
            className="h-11"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-up">{error}</p>}
        <DialogFooter>
          <Button type="button" className="h-11" onClick={save}>
            保存提醒
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
