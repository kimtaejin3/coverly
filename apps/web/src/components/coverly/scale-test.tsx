"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Microphone, Warning, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { detectPitch } from "@/components/coverly/use-voice-meter";
import { noteHz, noteName } from "@/lib/pitch";
import { cn } from "@/lib/utils";

/**
 * 도-레-미-파: a call-and-response scale that measures where a voice actually stops.
 *
 * The range we had came from whatever song the singer happened to pick, as the 98th percentile of
 * it. That is neither ceiling anyone has: not the note they can hold without strain, and not the
 * one they can just about reach.
 *
 * The scale only advances when it hears the note. A version that advanced on a timer walked the
 * whole way up an empty room, and every step it took without a voice was a step of silence in the
 * recording and a reading of nothing.
 *
 * It starts from a note the singer gives us rather than a fixed low one. Told to sing 3옥타브 도, a
 * man sings 2옥타브 도 — the same note an octave down, which is the right thing for him to do and
 * the wrong thing for a measurement. Accepting it would measure nobody's ceiling; rejecting it
 * would wall off every male voice at the top of the scale. Starting where they already are means
 * the question never comes up, and it skips the steps below them that nobody needed to sing.
 */

/** Whole tones. Semitone steps would be twice as accurate and twice as long to sit through. */
const STEP_SEMITONES = 2;
/** 3옥타브 솔. Past here we are measuring whistle register, not anything a song asks for. */
const CEILING_HZ = noteHz("솔", 3);
const MAX_STEPS = 14;

const TONE_MS = 900;
/** Frames of a matching pitch before the step counts. The worker needs 0.28s of held note. */
const HOLD_FRAMES = 6;
const FRAME_MS = 100;
/**
 * How far off counts as the right note.
 *
 * Wide on purpose. This is a gate, not a measurement — the worker reads the real pitches back off
 * the audio. What it has to catch is an empty room and an octave slip, and 150 cents does both
 * while letting through the ordinary flatness of someone singing into a laptop.
 */
const TOLERANCE_CENTS = 150;
/** After this long on one note, stop asking and offer the exit. */
const STRUGGLE_MS = 6000;

export interface ScaleResult {
  blob: Blob;
  /** The tone that was sounding when they said it had started to hurt. */
  comfortHz: number;
  /** Highest step they actually reached. The worker measures the real one from the audio. */
  topHz: number;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

const cents = (hz: number, target: number) => 1200 * Math.log2(hz / target);

type Phase = "idle" | "calibrate" | "tone" | "listen" | "saving";

export function ScaleTest({
  onDone,
  onCancel,
}: {
  onDone: (result: ScaleResult) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [heard, setHeard] = useState(0);
  const [hold, setHold] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [struggling, setStruggling] = useState(false);
  const [comfortHz, setComfortHz] = useState(0);

  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The render-loop values the audio callback needs. State updates are batched and would make it
  // read a target one frame stale, which at 100ms is a whole missed note.
  const phaseRef = useRef<Phase>("idle");
  const targetRef = useRef(0);
  const stepsRef = useRef<number[]>([]);
  const stepRef = useRef(0);
  const holdRef = useRef(0);
  const comfortRef = useRef(0);
  const reachedRef = useRef(0);
  const calibrationRef = useRef<number[]>([]);
  const doneRef = useRef(false);

  const stopEverything = useCallback(() => {
    doneRef.current = true;
    if (loopRef.current) clearInterval(loopRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    loopRef.current = timerRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  /** A triangle wave, not a sine: on a laptop speaker a 200 Hz sine is close to inaudible. */
  const playTone = useCallback((hz: number) => {
    const context = contextRef.current;
    if (!context) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gain.gain.setValueAtTime(0.22, now + TONE_MS / 1000 - 0.06);
    gain.gain.linearRampToValueAtTime(0, now + TONE_MS / 1000);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + TONE_MS / 1000 + 0.02);
  }, []);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (loopRef.current) clearInterval(loopRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhaseBoth("saving");
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      recorder.stream.getTracks().forEach((track) => track.stop());
      void contextRef.current?.close().catch(() => {});
      contextRef.current = null;
      onDone({
        blob,
        comfortHz: comfortRef.current,
        topHz: reachedRef.current || comfortRef.current,
      });
    };
    if (recorder.state === "paused") recorder.resume();
    recorder.stop();
  }, [onDone, setPhaseBoth]);

  /** Sound the next target with the recorder paused, then open it and wait to hear the note. */
  const ask = useCallback(
    (index: number) => {
      if (doneRef.current) return;
      const list = stepsRef.current;
      if (index >= list.length) {
        finish();
        return;
      }
      stepRef.current = index;
      targetRef.current = list[index];
      holdRef.current = 0;
      setStep(index);
      setHold(0);
      setStruggling(false);
      setPhaseBoth("tone");
      const recorder = recorderRef.current;
      // Pausing while the tone sounds is what keeps it out of the file. Filtering a reference tone
      // back out afterwards is guesswork; not recording it is not.
      if (recorder?.state === "recording") recorder.pause();
      playTone(list[index]);
      timerRef.current = setTimeout(() => {
        if (doneRef.current) return;
        if (recorderRef.current?.state === "paused") recorderRef.current.resume();
        setPhaseBoth("listen");
        timerRef.current = setTimeout(() => setStruggling(true), STRUGGLE_MS);
      }, TONE_MS);
    },
    [finish, playTone, setPhaseBoth],
  );

  /** Runs at 10 Hz for the whole session; what it does depends on the phase. */
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const context = contextRef.current;
    if (!analyser || !context || doneRef.current) return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    const level = Math.sqrt(sum / buffer.length);
    const hz = detectPitch(buffer, context.sampleRate);
    setQuiet(level < 0.01);
    setHeard(hz);

    if (phaseRef.current === "calibrate") {
      // A held note, not twelve detections gathered whenever. Accumulating every frame that
      // happened to yield a pitch meant a quiet room crept towards the threshold on its own --
      // background noise scores a reading now and then, and nothing ever took those back.
      if (hz > 0) {
        const recent = calibrationRef.current;
        // Starting a new note replaces the old one rather than averaging across the change.
        if (recent.length > 0 && Math.abs(cents(hz, recent[recent.length - 1])) > 200) {
          recent.length = 0;
        }
        recent.push(hz);
      } else if (calibrationRef.current.length > 0) {
        calibrationRef.current.pop();
      }
      // Roughly a second and a bit of steady pitch, which is enough to be sure it is a voice and
      // not a chair scraping.
      if (calibrationRef.current.length >= 12) {
        const sorted = [...calibrationRef.current].sort((a, b) => a - b);
        const start = sorted[Math.floor(sorted.length / 2)];
        const list: number[] = [];
        for (
          let value = start;
          value <= CEILING_HZ * 1.001 && list.length < MAX_STEPS;
          value *= Math.pow(2, STEP_SEMITONES / 12)
        ) {
          list.push(value);
        }
        stepsRef.current = list;
        setSteps(list);
        reachedRef.current = start;
        ask(0);
      }
      return;
    }

    if (phaseRef.current !== "listen") return;
    const target = targetRef.current;
    if (hz > 0 && Math.abs(cents(hz, target)) <= TOLERANCE_CENTS) {
      holdRef.current += 1;
      setHold(holdRef.current);
      if (holdRef.current >= HOLD_FRAMES) {
        reachedRef.current = target;
        if (timerRef.current) clearTimeout(timerRef.current);
        ask(stepRef.current + 1);
      }
    } else if (holdRef.current > 0) {
      // A wobble mid-note should not reset the whole hold, or a vibrato never finishes a step.
      holdRef.current = Math.max(0, holdRef.current - 1);
      setHold(holdRef.current);
    }
  }, [ask]);

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

      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      contextRef.current = context;
      analyserRef.current = analyser;

      doneRef.current = false;
      calibrationRef.current = [];
      comfortRef.current = 0;
      reachedRef.current = 0;
      setComfortHz(0);
      setPhaseBoth("calibrate");
      loopRef.current = setInterval(tick, FRAME_MS);
    } catch {
      toast.error("마이크를 사용할 수 없어요. 브라우저 권한을 확인해 주세요.");
    }
  }

  function markComfort() {
    const hz = targetRef.current;
    comfortRef.current = hz;
    setComfortHz(hz);
  }

  const target = targetRef.current;
  const off = heard > 0 && target > 0 ? cents(heard, target) : 0;

  if (phase === "idle") {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/50 p-4">
        <div>
          <p className="text-sm font-medium">내 음역대 재기</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            들려주는 음을 <span className="text-foreground">&ldquo;아&rdquo;</span> 하고 따라
            불러주세요. 한 음씩 올라가고, <span className="text-foreground">소리를 들려줘야</span>{" "}
            다음으로 넘어가요. 힘들어지는 지점에서 버튼을 눌러주시면 그 위로는 무리해서 부를 곡을
            추천하지 않습니다.
          </p>
        </div>
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          이어폰을 끼면 더 정확해요. 편한 음 하나로 시작해서 거기서부터 올라갑니다.
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

  if (phase === "calibrate") {
    return (
      <div className="space-y-3 rounded-xl border border-primary/40 bg-card/50 p-4">
        <div className="text-center">
          <p className="text-sm font-medium">편한 음 하나만 내주세요</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            제일 편한 높이로 &ldquo;아&mdash;&rdquo; 하고 2초쯤. 여기서부터 올라갑니다.
          </p>
        </div>
        <p className="text-center text-2xl font-bold tracking-tight">
          {heard > 0 ? noteName(heard) : quiet ? "…" : "듣는 중"}
        </p>
        <Progress value={Math.min(100, (calibrationRef.current.length / 12) * 100)} />
        {quiet ? (
          <p className="text-center text-xs text-amber-600 dark:text-amber-500">
            소리가 안 들려요. 마이크에 가까이서 불러주세요.
          </p>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={() => { stopEverything(); onCancel(); }}>
          그만두기
        </Button>
      </div>
    );
  }

  if (phase === "saving") {
    return (
      <div className="rounded-xl border border-primary/40 bg-card/50 p-4">
        <p className="text-center text-sm text-muted-foreground">음역대를 정리하는 중…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/40 bg-card/50 p-4">
      <Progress value={((step + 1) / Math.max(1, steps.length)) * 100} />

      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          {phase === "tone" ? "잘 들어보세요" : "따라 불러주세요"}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tracking-tight transition-colors",
            phase === "listen" ? "text-primary" : "text-foreground",
          )}
        >
          {noteName(target)}
        </p>

        {phase === "listen" ? (
          <>
            {/* Holding the note fills the bar. Six frames at 100ms is 0.6s, comfortably more than
                the 0.28s the worker needs to call it a held note. */}
            <div className="mx-auto mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.min(100, (hold / HOLD_FRAMES) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {quiet
                ? "소리가 안 들려요"
                : heard <= 0
                  ? "음을 잡는 중…"
                  : Math.abs(off) <= TOLERANCE_CENTS
                    ? "좋아요"
                    : off < 0
                      ? `조금 낮아요 · 지금 ${noteName(heard)}`
                      : `조금 높아요 · 지금 ${noteName(heard)}`}
            </p>
          </>
        ) : null}
      </div>

      {comfortHz > 0 ? (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle className="size-3.5 text-primary" weight="fill" aria-hidden />
          편한 한계 <span className="font-medium text-foreground">{noteName(comfortHz)}</span>
        </p>
      ) : null}

      {struggling ? (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-center text-xs leading-relaxed text-muted-foreground">
          이 음이 잘 안 나오면 여기가 한계예요. 아래 버튼으로 끝내면 됩니다.
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button variant={comfortHz > 0 ? "ghost" : "secondary"} onClick={markComfort}>
          <Warning className="size-4" aria-hidden />
          {comfortHz > 0 ? "여기로 다시 표시" : "여기부터 힘들어요"}
        </Button>
        <Button variant={struggling ? "default" : "ghost"} onClick={finish}>
          <X className="size-4" aria-hidden />
          더 못 올라가겠어요
        </Button>
      </div>
    </div>
  );
}
