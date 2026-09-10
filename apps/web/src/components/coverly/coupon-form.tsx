"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, Ticket } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Redeem a promo code. Collapsed until asked for, so it does not compete with the main flow. */
export function CouponForm({
  defaultOpen = false,
  onDone,
}: {
  defaultOpen?: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "쿠폰을 등록하지 못했어요.");
        return;
      }
      toast.success(`무료 생성 ${data.granted}회가 추가됐어요.`);
      setCode("");
      setOpen(false);
      onDone?.();
      // The quota is rendered on the server, so the header and the sidebar need a fresh render.
      router.refresh();
    } catch {
      toast.error("네트워크 오류로 등록하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Ticket className="size-3.5" aria-hidden />
        쿠폰 등록하기
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="coupon" className="block text-xs font-medium">
        쿠폰 코드
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="COVERLY5"
          autoComplete="off"
          className="h-9 font-mono text-sm uppercase"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={busy || !code.trim()}>
          {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : "등록"}
        </Button>
      </div>
    </form>
  );
}
