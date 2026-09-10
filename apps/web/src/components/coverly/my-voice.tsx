"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, CircleNotch, Warning } from "@phosphor-icons/react";

import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import { RangeGauge } from "@/components/coverly/range-gauge";
import { VoiceRecorder } from "@/components/coverly/voice-recorder";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Voice } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PersonalVoice {
  id: string;
  name: string;
  status: "queued" | "training" | "ready" | "failed";
  error_message: string | null;
  training_progress: number;
  training_stage: string | null;
  f0_low: number | null;
  f0_median: number | null;
  f0_high: number | null;
}

/**
 * The user's own voice, shown inside the voice step rather than as a separate page: it is one
 * more thing you can sing with, so it belongs where the other voices are.
 */
export function MyVoice({
  initial,
  selectedId,
  onSelect,
  signedIn,
}: {
  initial: PersonalVoice | null;
  selectedId: string | null;
  onSelect: (voice: Voice) => void;
  signedIn: boolean;
}) {
  const [voice, setVoice] = useState<PersonalVoice | null>(initial);
  // Re-recording overwrites the same row rather than deleting it: covers already made with this
  // voice reference it, and the foreign key has no ON DELETE, so removing it would take the
  // owner's history with it.
  const [redo, setRedo] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/voices/train", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      setVoice(data.voice ?? null);
      if (data.voice && data.voice.status !== "ready") setRedo(false);
      // Keep checking only while there is something to wait for.
      if (data.voice && (data.voice.status === "queued" || data.voice.status === "training")) {
        pollRef.current = setTimeout(poll, 10000);
      }
    } catch {
      pollRef.current = setTimeout(poll, 20000);
    }
  }, []);

  useEffect(() => {
    if (voice && (voice.status === "queued" || voice.status === "training")) {
      pollRef.current = setTimeout(poll, 15000);
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [voice, poll]);

  if (!signedIn) return null;

  if (!voice || redo) {
    return (
      <div className="space-y-2">
        <VoiceRecorder onTrainingStarted={() => void poll()} />
        {redo ? (
          <button
            type="button"
            onClick={() => setRedo(false)}
            className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            그만두고 지금 목소리 쓰기
          </button>
        ) : null}
      </div>
    );
  }

  if (voice.status === "queued" || voice.status === "training") {
    const percent = Math.max(2, voice.training_progress ?? 0);
    return (
      <div className="space-y-2.5 rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div className="flex items-center gap-2.5">
          <CircleNotch className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <p className="flex-1 text-sm font-medium">내 목소리를 배우는 중</p>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{percent}%</span>
        </div>
        <Progress value={percent} />
        <p className="text-xs text-muted-foreground">
          {voice.training_stage ?? "차례를 기다리는 중"} · 약 20분 걸려요. 창을 닫아도 계속됩니다.
        </p>
      </div>
    );
  }

  if (voice.status === "failed") {
    return (
      <div className="space-y-2 rounded-xl bg-destructive/8 p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Warning className="size-4 text-destructive" aria-hidden />
          목소리를 만들지 못했어요
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {voice.error_message ?? "다시 녹음해 주세요."}
        </p>
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setVoice(null)}>
          다시 녹음하기
        </Button>
      </div>
    );
  }

  const selected = selectedId === voice.id;
  return (
    <div className="space-y-1">
      <button
      type="button"
      aria-pressed={selected}
      onClick={() =>
        onSelect({
          id: voice.id,
          name: voice.name,
          description: "내가 녹음한 목소리",
          gender: "female",
          tags: ["내 목소리"],
          sampleUrl: "",
          sampleTitle: "",
          rangeLabel: "",
          accent: "",
          sourceCredit: null,
          sourceLicense: null,
          isActive: true,
        })
      }
      className={cn(
        "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
        selected ? "bg-primary/12" : "hover:bg-secondary/70",
      )}
    >
      <VoiceAvatar voiceId={voice.id} name={voice.name} className="size-9 rounded-[0.7rem]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{voice.name}</span>
          <CheckCircle className="size-3.5 shrink-0 text-primary" weight="fill" aria-hidden />
        </span>
        <span className="block truncate text-xs text-muted-foreground">내가 녹음한 목소리</span>
      </span>
      </button>

      {/* What the model actually learned, so the owner can see why some songs move further than
          others. */}
      {voice.f0_high ? (
        <RangeGauge
          lowHz={voice.f0_low ?? 0}
          highHz={voice.f0_high}
          className="rounded-lg bg-secondary/40 px-2.5 py-2"
        />
      ) : null}

      {/* A sibling, never nested: a button inside a button is invalid and the browser reparents
          it, which breaks hydration. */}
      <button
        type="button"
        onClick={() => setRedo(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      >
        <ArrowCounterClockwise className="size-3.5" aria-hidden />
        지우고 다시 녹음하기
      </button>
    </div>
  );
}
