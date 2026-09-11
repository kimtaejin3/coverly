"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Microphone, Warning, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { noteHz, noteName } from "@/lib/pitch";
import { cn } from "@/lib/utils";

/**
 * 도-레-미-파: a call-and-response scale that measures where a voice actually stops.
 *
 * The range we had came from whatever song the singer happened to pick, as the 98th percentile of
 * it. That is neither ceiling anyone has: not the note they can hold without strain, and not the
 * one they can just about reach. 공허해 read as two semitones away and cracked because the number
 * it was compared against was neither.
 *
 * Two things make this take readable in a way a song is not. The singer stops on each step, so the
 * worker can segment held notes instead of taking percentiles over a continuous performance. And
 * the point where it starts to hurt is *marked by the singer*, because comfort is a judgement only
 * they can make — no acoustic measure is a reliable stand-in for it.
 */

/** Whole tones. Semitone steps would be twice as accurate and twice as long to sit through. */
const STEP_SEMITONES = 2;
/** 1옥타브 솔. Low enough for most men to start comfortably, not absurd for a soprano. */
const START_HZ = noteHz("솔", 1);
/** 3옥타브 솔. Past here we are measuring whistle register, not anything a song asks for. */
const CEILING_HZ = noteHz("솔", 3);
const TONE_MS = 1000;
const SING_MS = 1500;

export interface ScaleResult {
  blob: Blob;
  /** The tone that was sounding when they said it had started to hurt. */
  comfortHz: number;
  /** Highest step they attempted, for the gauge. The worker measures the real one from the audio. */
  topHz: number;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

const STEPS = (() => {
  const out: number[] = [];
  for (let hz = START_HZ; hz <= CEILING_HZ * 1.001; hz *= Math.pow(2, STEP_SEMITONES / 12)) {
    out.push(hz);
  }
  return out;
})();

export function ScaleTest({
  onDone,
  onCancel,
}: {
  onDone: (result: ScaleResult) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(-1);
  const [phase, setPhase] = useState<"tone" | "sing">("tone");
  const [comfortHz, setComfortHz] = useState(0);
  const [running, setRunning] = useState(false);

  const contextRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stepRef = useRef(-1);
  const comfortRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  /** A triangle wave, not a sine: on a laptop speaker a 200 Hz sine is close to inaudible. */
  const playTone = useCallback((hz: number) => {
    const context = contextRef.current;
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const now = context.currentTime;
    // Ramp both ends: a square-edged gate on an oscillator is a click, and a click is what the
    // pitch tracker locks onto.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.setValueAtTime(0.22, now + TONE_MS / 1000 - 0.06);
    gain.gain.linearRampToValueAtTime(0, now + TONE_MS / 1000);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + TONE_MS / 1000 + 0.02);
  }, []);

  const finish = useCallback(() => {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      recorder.stream.getTracks().forEach((track) => track.stop());
      void contextRef.current?.close().catch(() => {});
      contextRef.current = null;
      setRunning(false);
      onDone({
        blob,
        comfortHz: comfortRef.current,
        topHz: STEPS[Math.max(0, Math.min(STEPS.length - 1, stepRef.current))],
      });
    };
    if (recorder.state === "paused") recorder.resume();
    recorder.stop();
  }, [onDone]);

  /** One step: sound the tone with the recorder paused, then open it for the response. */
  const advance = useCallback(
    (index: number) => {
      if (cancelledRef.current) return;
      if (index >= STEPS.length) {
        finish();
        return;
      }
      stepRef.current = index;
      setStep(index);
      setPhase("tone");
      const recorder = recorderRef.current;
      // Pausing while the tone sounds is what keeps it out of the file. Filtering a reference
      // tone back out afterwards is guesswork; not recording it is not.
      if (recorder?.state === "recording") recorder.pause();
      playTone(STEPS[index]);
      timerRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        setPhase("sing");
        if (recorderRef.current?.state === "paused") recorderRef.current.resume();
        timerRef.current = setTimeout(() => advance(index + 1), SING_MS);
      }, TONE_MS);
    },
    [finish, playTone],
  );

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.start();
      recorderRef.current = recorder;
      contextRef.current = new AudioContext();
      cancelledRef.current = false;
      comfortRef.current = 0;
      setComfortHz(0);
      setRunning(true);
      advance(0);
    } catch {
      toast.error("마이크를 사용할 수 없어요. 브라우저 권한을 확인해 주세요.");
    }
  }

  function markComfort() {
    comfortRef.current = STEPS[stepRef.current];
    setComfortHz(STEPS[stepRef.current]);
  }

  const current = step >= 0 ? STEPS[Math.min(step, STEPS.length - 1)] : 0;

  if (!running) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div>
          <p className="text-sm font-medium">내 음역대 재기</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            들려주는 음을 <span className="text-foreground">&ldquo;아&rdquo;</span> 하고 따라
            불러주세요. 조금씩 올라갑니다. 힘들어지는 지점에서 버튼을 눌러주시면, 그 위로는
            무리해서 부를 곡을 추천하지 않아요.
          </p>
        </div>
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          이어폰을 끼면 더 정확해요. 약 {Math.round((STEPS.length * (TONE_MS + SING_MS)) / 1000)}초
          걸립니다.
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={start}>
            <Microphone className="size-4" weight="fill" aria-hidden />
            음역대 재기 시작
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            건너뛰기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-card/50 p-4">
      <Progress value={((step + 1) / STEPS.length) * 100} />

      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          {phase === "tone" ? "잘 들어보세요" : "따라 불러주세요"}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tracking-tight transition-colors",
            phase === "sing" ? "text-primary" : "text-foreground",
          )}
        >
          {noteName(current)}
        </p>
        <div
          className={cn(
            "mx-auto mt-2 h-1.5 w-24 rounded-full transition-colors",
            phase === "sing" ? "bg-primary" : "bg-secondary",
          )}
          aria-hidden
        />
      </div>

      {comfortHz > 0 ? (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle className="size-3.5 text-primary" weight="fill" aria-hidden />
          편한 한계 <span className="font-medium text-foreground">{noteName(comfortHz)}</span>
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button variant={comfortHz > 0 ? "ghost" : "secondary"} onClick={markComfort}>
          <Warning className="size-4" aria-hidden />
          {comfortHz > 0 ? "여기로 다시 표시" : "여기부터 힘들어요"}
        </Button>
        <Button variant="ghost" onClick={finish}>
          <X className="size-4" aria-hidden />
          더 못 올라가겠어요
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        무리해서 올리지 않아도 돼요. 끝까지 가면 자동으로 멈춥니다.
      </p>
    </div>
  );
}
