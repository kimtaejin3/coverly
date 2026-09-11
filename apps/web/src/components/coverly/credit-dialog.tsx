"use client";

import { useEffect, useState } from "react";
import { CircleNotch, Lightning } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Pack {
  productId: string;
  credits: number;
  priceCents: number;
}

/** Buy credits. Renders nothing until the server says checkout is actually configured. */
export function CreditDialog({
  open,
  onOpenChange,
  balance,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  balance: number;
}) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || packs) return;
    fetch("/api/checkout")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(Boolean(d.enabled));
        setPacks(d.packs ?? []);
      })
      .catch(() => setPacks([]));
  }, [open, packs]);

  async function buy(pack: Pack) {
    setBusy(pack.productId);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: pack.productId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        toast.error(data.error ?? "결제를 시작하지 못했어요.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("네트워크 오류로 결제를 시작하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>크레딧 충전</DialogTitle>
          <DialogDescription>
            크레딧 1개로 내 목소리를 한 번 더 만들 수 있어요. 현재 {balance}개.
          </DialogDescription>
        </DialogHeader>

        {packs === null ? (
          <p className="py-3 text-sm text-muted-foreground">불러오는 중…</p>
        ) : !enabled || packs.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">결제 준비 중입니다.</p>
        ) : (
          <div className="space-y-2">
            {packs.map((pack) => (
              <button
                key={pack.productId}
                type="button"
                disabled={busy !== null}
                onClick={() => void buy(pack)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors",
                  busy === pack.productId ? "opacity-60" : "hover:border-primary/50",
                )}
              >
                <Lightning className="size-4 shrink-0 text-primary" weight="fill" aria-hidden />
                <span className="flex-1 text-sm font-medium">크레딧 {pack.credits}개</span>
                <span className="font-mono text-sm tabular-nums">
                  ${(pack.priceCents / 100).toFixed(2)}
                </span>
                {busy === pack.productId ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : null}
              </button>
            ))}
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
              결제는 Polar에서 진행되며 USD로 청구됩니다. 영수증과 환불도 Polar가 처리합니다.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
