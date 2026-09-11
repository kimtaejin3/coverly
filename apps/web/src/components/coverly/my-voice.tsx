"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, CircleNotch, Plus, Warning } from "@phosphor-icons/react";

import { RangeGauge } from "@/components/coverly/range-gauge";
import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import { VoiceRecorder } from "@/components/coverly/voice-recorder";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MAX_PERSONAL_VOICES } from "@/lib/config";
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
  f0_peak: number | null;
  /** Comfortable ceiling, marked by the singer on the scale take. */
  f0_comfort_high: number | null;
  /** Reached with strain or falsetto. The whole of what came out, for the gauge. */
  f0_absolute_high: number | null;
  /** Highest note in 진성. What song matching compares against -- songs ask for 진성. */
  f0_modal_high: number | null;
  /** Highest note in 가성, when they used it at all. Shown, never matched on. */
  f0_falsetto_high: number | null;
  /** What the fine-tune actually saw. A model fact, not a throat fact -- the key decision reads it. */
  f0_train_high: number | null;
}

/** A personal voice, shaped like a catalogue Voice so the rest of the app need not special-case it. */
export function asVoice(voice: PersonalVoice): Voice {
  return {
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
  };
}

/**
 * The account's own voices, shown inside the voice step rather than on a page of their own: they
 * are more things you can sing with, so they belong where the other voices are.
 */
export function MyVoice({
  initial,
  selectedId,
  onSelect,
  signedIn,
}: {
  initial: PersonalVoice[];
  selectedId: string | null;
  onSelect: (voice: Voice) => void;
  signedIn: boolean;
}) {
  const [voices, setVoices] = useState<PersonalVoice[]>(initial);
  // Which voice the recorder is replacing, "new" for an extra one, null when it is closed.
  const [recording, setRecording] = useState<string | "new" | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = voices.some((v) => v.status === "queued" || v.status === "training");

  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/voices/train", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const next: PersonalVoice[] = data.voices ?? [];
      setVoices(next);
      if (next.some((v) => v.status === "queued" || v.status === "training")) {
        pollRef.current = setTimeout(poll, 10000);
      } else {
        setRecording(null);
      }
    } catch {
      pollRef.current = setTimeout(poll, 20000);
    }
  }, []);

  useEffect(() => {
    if (busy) pollRef.current = setTimeout(poll, 10000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [busy, poll]);

  if (!signedIn) return null;

  if (recording !== null) {
    return (
      <div className="space-y-2">
        <VoiceRecorder
          voiceId={recording === "new" ? undefined : recording}
          onTrainingStarted={() => void poll()}
        />
        {voices.length > 0 ? (
          <button
            type="button"
            onClick={() => setRecording(null)}
            className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            그만두기
          </button>
        ) : null}
      </div>
    );
  }

  if (voices.length === 0) {
    return <VoiceRecorder onTrainingStarted={() => void poll()} />;
  }

  return (
    <div className="space-y-1.5">
      {voices.map((voice) => (
        <VoiceRow
          key={voice.id}
          voice={voice}
          selected={selectedId === voice.id}
          onSelect={() => onSelect(asVoice(voice))}
          onRedo={() => setRecording(voice.id)}
        />
      ))}

      {!busy && voices.length < MAX_PERSONAL_VOICES ? (
        <button
          type="button"
          onClick={() => setRecording("new")}
          className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          목소리 더 만들기
        </button>
      ) : null}
    </div>
  );
}

function VoiceRow({
  voice,
  selected,
  onSelect,
  onRedo,
}: {
  voice: PersonalVoice;
  selected: boolean;
  onSelect: () => void;
  onRedo: () => void;
}) {
  if (voice.status === "queued" || voice.status === "training") {
    const percent = Math.max(2, voice.training_progress ?? 0);
    return (
      <div className="space-y-2.5 rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div className="flex items-center gap-2.5">
          <CircleNotch className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          <p className="flex-1 truncate text-sm font-medium">{voice.name} 배우는 중</p>
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
          {voice.name}을 만들지 못했어요
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {voice.error_message ?? "다시 녹음해 주세요."}
        </p>
        <Button variant="secondary" size="sm" className="w-full" onClick={onRedo}>
          다시 녹음하기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
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

      {selected ? (
        <>
          {/* What the model actually learned, so the owner can see why some songs move further
              than others. Only for the selected voice, or the sidebar becomes a wall of gauges. */}
          {voice.f0_high ? (
            <RangeGauge
              lowHz={voice.f0_low ?? 0}
              highHz={voice.f0_absolute_high ?? voice.f0_peak ?? voice.f0_high}
              comfortHz={voice.f0_comfort_high ?? 0}
              className="rounded-lg bg-secondary/40 px-2.5 py-2"
            />
          ) : null}

          {/* A sibling, never nested: a button inside a button is invalid and the browser
              reparents it, which breaks hydration. */}
          <button
            type="button"
            onClick={onRedo}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          >
            <ArrowCounterClockwise className="size-3.5" aria-hidden />
            지우고 다시 녹음하기
          </button>
        </>
      ) : null}
    </div>
  );
}
