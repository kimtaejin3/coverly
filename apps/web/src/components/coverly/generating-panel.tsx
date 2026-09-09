"use client";

import { useEffect, useRef, useState } from "react";
import { CircleNotch, Check } from "@phosphor-icons/react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { GENERATION_STAGES } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;
/** Only used to animate the bar; the truth is the status the server reports. */
const EXPECTED_MS = 120_000;

/**
 * Polls `GET /api/covers/:id/status` every five seconds (PRD §38). The worker does not report a
 * percentage, so the bar is driven by elapsed time and capped below 100 until the server actually
 * says completed — a bar that sits at 100% while nothing happens reads as a hang.
 */
export function GeneratingPanel({
  coverId,
  onDone,
  onFailed,
}: {
  coverId: string;
  onDone: (audioUrl: string | null, shareUrl: string | null) => void;
  onFailed: (message: string) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  const failedRef = useRef(onFailed);
  doneRef.current = onDone;
  failedRef.current = onFailed;

  useEffect(() => {
    const startedAt = Date.now();
    let stopped = false;

    const bar = setInterval(() => {
      setProgress(Math.min(95, ((Date.now() - startedAt) / EXPECTED_MS) * 100));
    }, 200);

    async function poll() {
      try {
        const response = await fetch(`/api/covers/${coverId}/status`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        setQueuePosition(data.queuePosition ?? null);
        setWarning(null);
        if (data.status === "completed") {
          stopped = true;
          setProgress(100);
          doneRef.current(data.audioUrl ?? null, data.shareUrl ?? null);
        } else if (data.status === "failed") {
          stopped = true;
          failedRef.current(data.errorMessage ?? "생성에 실패했어요. 다시 시도해 주세요.");
        }
      } catch {
        // A dropped poll is not a failed generation; say so and keep trying.
        setWarning("상태를 확인하는 중이에요…");
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }

    let timer = setTimeout(poll, POLL_MS);
    void poll();

    return () => {
      stopped = true;
      clearInterval(bar);
      clearTimeout(timer);
    };
  }, [coverId]);

  const stageIndex = Math.min(
    GENERATION_STAGES.length - 1,
    Math.floor((progress / 100) * GENERATION_STAGES.length),
  );

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <CircleNotch className="size-5 animate-spin text-primary" aria-hidden />
        <div>
          <p className="font-medium">AI 커버를 만들고 있어요</p>
          <p className="text-sm text-muted-foreground">
            {queuePosition && queuePosition > 1
              ? `현재 ${queuePosition}번째 순서 · 예상 약 1~2분`
              : "예상 시간 약 1~2분"}
          </p>
        </div>
      </div>

      <Progress value={progress} className="mt-5" />

      <ol className="mt-5 space-y-2.5">
        {GENERATION_STAGES.map((stage, index) => {
          const done = index < stageIndex;
          const active = index === stageIndex;
          return (
            <li key={stage.key} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="size-4 text-primary" aria-hidden />
              ) : active ? (
                <CircleNotch className="size-4 animate-spin text-primary" aria-hidden />
              ) : (
                <span className="size-4 rounded-full border border-border" aria-hidden />
              )}
              <span className={cn(done || active ? "text-foreground" : "text-muted-foreground")}>
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>

      {warning ? (
        <Alert className="mt-5">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}

      <p className="mt-5 text-xs text-muted-foreground">
        창을 닫아도 생성은 계속됩니다. 완료되면 결과 페이지로 이동해요.
      </p>
    </div>
  );
}
