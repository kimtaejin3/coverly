"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Microphone, SpeakerHigh, Warning, X } from "@phosphor-icons/react";
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

/**
 * The reference tone.
 *
 * 900ms with a 30ms attack was a blip, and a blip is not a pitch anyone can carry into their
 * throat. This is long enough to hear, settle on, and take a breath before. The gap after it lets
 * the release tail die out before the microphone opens, so the tail is not read as the singer's
 * first note.
 */
const TONE_MS = 1600;
const TONE_ATTACK_S = 0.08;
const TONE_RELEASE_S = 0.25;
const TONE_GAP_MS = 350;
/** Scheduled a little ahead of `currentTime`, or the audio thread can find the start already past. */
const TONE_LOOKAHEAD_S = 0.06;
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
/**
 * How far H1-H2 has to rise above the low notes before we call it falsetto.
 *
 * Falsetto's glottal flow is close to a sine, so the harmonics above the fundamental collapse and
 * H1 pulls away from H2 -- measured at +1.8 dB in chest and +13.5 dB in falsetto on synthesised
 * vowels. The comparison is against this singer's own low notes rather than a fixed number,
 * because the baseline moves with the microphone and the voice.
 *
 * This is the live indicator only. The worker re-derives the split from the audio and that is the
 * value anything is decided on.
 */
const FALSETTO_JUMP_DB = 8;
/**
 * How long a reading survives a dropout before the display gives up on it.
 *
 * The detector runs ten times a second and returns 0 whenever a frame is unvoiced -- between
 * syllables, on a breath, on a consonant. Rendering that directly made every label blink several
 * times a second. Holding the last reading for a moment costs nothing: nobody's pitch changes
 * meaningfully in half a second, and the gate that actually advances the step reads the raw value,
 * not this one.
 */
const PITCH_HOLD_MS = 500;
/** Same idea for the level warning, which otherwise strobes whenever someone breathes. */
const QUIET_HOLD_MS = 700;
const QUIET_LEVEL = 0.01;

export interface ScaleResult {
  blob: Blob;
  /** The tone that was sounding when they said it had started to hurt. */
  comfortHz: number;
  /** Highest step they actually reached, falsetto included. */
  topHz: number;
  /** Highest step reached before the voice flipped into falsetto, for ranking songs right away. */
  modalTopHz: number;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

const cents = (hz: number, target: number) => 1200 * Math.log2(hz / target);

/** First harmonic minus second, in dB, read straight off the analyser's spectrum. */
function h1MinusH2(spectrum: Float32Array, binHz: number, f0: number): number {
  const peakNear = (target: number) => {
    const half = Math.max(binHz, target * 0.06);
    let best = -Infinity;
    const from = Math.max(0, Math.floor((target - half) / binHz));
    const to = Math.min(spectrum.length - 1, Math.ceil((target + half) / binHz));
    for (let i = from; i <= to; i += 1) best = Math.max(best, spectrum[i]);
    return best;
  };
  const h1 = peakNear(f0);
  const h2 = peakNear(f0 * 2);
  // getFloatFrequencyData is already in dB, so the difference is the measure.
  return Number.isFinite(h1) && Number.isFinite(h2) ? h1 - h2 : 0;
}

type Phase = "idle" | "calibrate" | "tone" | "listen" | "saving";

export function ScaleTest({
  onDone,
  onCancel,
  /** "건너뛰기" only reads right when there is a next step to skip to. Standalone, there isn't. */
  cancelLabel = "건너뛰기",
}: {
  onDone: (result: ScaleResult) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [heard, setHeard] = useState(0);
  const [hold, setHold] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [struggling, setStruggling] = useState(false);
  const [comfortHz, setComfortHz] = useState(0);
  const [falsetto, setFalsetto] = useState(false);

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
  const pitchSeenAtRef = useRef(0);
  const quietSinceRef = useRef(0);
  const h1h2Ref = useRef(0);
  /** H1-H2 of each completed step, in order. The first few set this singer's chest baseline. */
  const baselineRef = useRef<number[]>([]);
  const modalTopRef = useRef(0);
  const falsettoRef = useRef(false);

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

  const toneNodesRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);

  /**
   * Sound the target and resolve when it has finished.
   *
   * A sine plus a soft second and third harmonic, not a triangle. A triangle's odd harmonics are
   * what made it buzz; a bare sine is what makes 200 Hz vanish on a laptop speaker. Two quiet
   * partials give it enough body to carry without the edge.
   *
   * Any tone still sounding is stopped first, so a fast retry cannot stack two of them into a
   * beating mess -- which is exactly what "unstable" sounds like.
   */
  const playTone = useCallback(async (hz: number): Promise<void> => {
    const context = contextRef.current;
    if (!context) return;
    // Browsers start a context suspended until a gesture lands, and some suspend it again on a
    // tab switch. A suspended context takes the schedule and plays nothing, late, or half of it.
    if (context.state !== "running") {
      await context.resume().catch(() => {});
    }
    if (toneNodesRef.current) {
      const { oscs, gain } = toneNodesRef.current;
      const t = context.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.03);
      for (const osc of oscs) osc.stop(t + 0.04);
      toneNodesRef.current = null;
    }

    const start = context.currentTime + TONE_LOOKAHEAD_S;
    const length = TONE_MS / 1000;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.28, start + TONE_ATTACK_S);
    gain.gain.setValueAtTime(0.28, start + length - TONE_RELEASE_S);
    gain.gain.linearRampToValueAtTime(0, start + length);
    gain.connect(context.destination);

    const oscs = ([1, 2, 3] as const).map((harmonic) => {
      const osc = context.createOscillator();
      const partial = context.createGain();
      osc.type = "sine";
      osc.frequency.value = hz * harmonic;
      partial.gain.value = harmonic === 1 ? 1 : harmonic === 2 ? 0.35 : 0.12;
      osc.connect(partial).connect(gain);
      osc.start(start);
      osc.stop(start + length + 0.02);
      return osc;
    });
    toneNodesRef.current = { oscs, gain };

    await new Promise<void>((resolve) => {
      const done = () => {
        if (toneNodesRef.current?.oscs === oscs) toneNodesRef.current = null;
        resolve();
      };
      oscs[0].onended = done;
      // Belt and braces: onended does not fire if the context is closed mid-tone.
      setTimeout(done, (TONE_LOOKAHEAD_S + length) * 1000 + 100);
    });
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
        modalTopHz: modalTopRef.current || reachedRef.current || comfortRef.current,
      });
    };
    if (recorder.state === "paused") recorder.resume();
    recorder.stop();
  }, [onDone, setPhaseBoth]);

  /**
   * Play the target and hand over to listening. Also what "다시 듣기" calls: a missed tone used to
   * leave someone guessing at a note they never properly heard.
   */
  const sound = useCallback(
    async (hz: number) => {
      if (doneRef.current) return;
      const recorder = recorderRef.current;
      setPhaseBoth("tone");
      // Pausing while the tone sounds is what keeps it out of the file. Filtering a reference tone
      // back out afterwards is guesswork; not recording it is not.
      if (recorder?.state === "recording") recorder.pause();
      await playTone(hz);
      if (doneRef.current || targetRef.current !== hz) return;
      // Let the release die before the microphone opens.
      await new Promise((r) => setTimeout(r, TONE_GAP_MS));
      if (doneRef.current || targetRef.current !== hz) return;
      if (recorderRef.current?.state === "paused") recorderRef.current.resume();
      setPhaseBoth("listen");
      timerRef.current = setTimeout(() => setStruggling(true), STRUGGLE_MS);
    },
    [playTone, setPhaseBoth],
  );

  /** Sound the next target with the recorder paused, then open it and wait to hear the note. */
  const ask = useCallback(
    (index: number) => {
      if (doneRef.current) return;
      const list = stepsRef.current;
      if (index >= list.length) {
        finish();
        return;
      }
      // A struggle timer from the previous step could still be pending; never let it fire into
      // this one.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      stepRef.current = index;
      targetRef.current = list[index];
      holdRef.current = 0;
      pitchSeenAtRef.current = 0;
      quietSinceRef.current = 0;
      setStep(index);
      setHold(0);
      setHeard(0);
      setQuiet(false);
      setStruggling(false);
      void sound(list[index]);
    },
    [finish, sound],
  );

  /** Runs at 10 Hz for the whole session; what it does depends on the phase. */
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const context = contextRef.current;
    if (!analyser || !context || doneRef.current) return;
    // The speaker is feeding the microphone right now. Reading pitch off that and painting it on
    // the screen is what made the display jump around during the tone.
    if (phaseRef.current === "tone") return;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    const level = Math.sqrt(sum / buffer.length);
    const hz = detectPitch(buffer, context.sampleRate);
    const now = Date.now();

    // Both of these are display smoothing only. Everything that decides anything below reads `hz`.
    if (hz > 0) {
      pitchSeenAtRef.current = now;
      setHeard(hz);
    } else if (now - pitchSeenAtRef.current > PITCH_HOLD_MS) {
      setHeard(0);
    }
    if (level >= QUIET_LEVEL) {
      quietSinceRef.current = 0;
      setQuiet(false);
    } else {
      if (!quietSinceRef.current) quietSinceRef.current = now;
      if (now - quietSinceRef.current > QUIET_HOLD_MS) setQuiet(true);
    }

    if (hz > 0) {
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(spectrum);
      h1h2Ref.current = h1MinusH2(spectrum, context.sampleRate / analyser.fftSize, hz);
      const baseline = baselineRef.current;
      if (baseline.length >= 2) {
        const sorted = [...baseline].sort((a, b) => a - b);
        const chest = sorted[Math.floor(sorted.length / 2)];
        const flipped = h1h2Ref.current - chest > FALSETTO_JUMP_DB;
        falsettoRef.current = flipped;
        setFalsetto(flipped);
      }
    }

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
        // The first steps are the low ones, sung in chest by definition -- they are the baseline
        // everything above gets measured against.
        if (baselineRef.current.length < 3) baselineRef.current.push(h1h2Ref.current);
        if (!falsettoRef.current) modalTopRef.current = target;
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
      // We are inside a click handler, so this is allowed and it is the one moment it is certain
      // to be allowed. Every later resume is a fallback.
      await context.resume().catch(() => {});
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

  function replay() {
    // Allowed mid-tone too: playTone stops whatever is sounding first, so this restarts cleanly.
    if (phaseRef.current !== "listen" && phaseRef.current !== "tone") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    holdRef.current = 0;
    setHold(0);
    setStruggling(false);
    void sound(targetRef.current);
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
      <div className="space-y-4 py-1">
        <ol className="space-y-2.5">
          {[
            ["들려주는 음을 “아” 하고 따라 부르기", "소리를 들려줘야 다음 음으로 넘어가요"],
            ["조금씩 올라갑니다", "편한 음 하나로 시작해서 거기서부터"],
            ["힘들어지면 버튼 누르기", "그 위로는 무리해서 부를 곡을 추천하지 않아요"],
          ].map(([title, hint], index) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-[0.625rem] text-primary">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-snug">{title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-secondary/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          이어폰을 끼면 더 정확해요. 재고 나면 부를 수 있는 곡을 진성 기준으로 골라드립니다.
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button size="lg" onClick={start}>
            <Microphone className="size-4" weight="fill" aria-hidden />
            음역대 재기 시작
          </Button>
          <Button size="lg" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "calibrate") {
    return (
      <div className="space-y-5 py-4 text-center">
        <div>
          <p className="text-sm font-medium">편한 음 하나만 내주세요</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            제일 편한 높이로 &ldquo;아&mdash;&rdquo; 하고 2초쯤. 여기서부터 올라갑니다.
          </p>
        </div>
        <p
          className={cn(
            "text-4xl font-bold tracking-tight tabular-nums transition-colors",
            heard > 0 ? "text-primary" : "text-muted-foreground/50",
          )}
        >
          {heard > 0 ? noteName(heard) : "…"}
        </p>
        <Progress value={Math.min(100, (calibrationRef.current.length / 12) * 100)} />
        <p className="text-xs text-muted-foreground">
          {quiet ? "소리가 안 들려요. 마이크에 가까이서 불러주세요." : "그대로 유지해 주세요"}
        </p>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            stopEverything();
            onCancel();
          }}
        >
          그만두기
        </Button>
      </div>
    );
  }

  if (phase === "saving") {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">음역대를 정리하는 중…</p>
    );
  }

  // How far off, as a position on the needle track. 300 cents each way covers a miss wide enough
  // to see without the marker slamming into the end and sitting there.
  const needle = Math.max(-1, Math.min(1, off / 300));

  return (
    <div className="space-y-4 py-2">
      <Progress value={((step + 1) / Math.max(1, steps.length)) * 100} />

      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          {phase === "tone" ? "잘 들어보세요" : "따라 불러주세요"}
        </p>
        <p
          className={cn(
            "mt-1 text-5xl font-bold tracking-tight transition-colors",
            phase === "listen" ? "text-primary" : "text-foreground",
          )}
        >
          {noteName(target)}
        </p>
        {/* The one control that matters on this screen. Hearing the note is the whole job of the
            step, and it has to be there before, during and after the automatic play -- someone
            who missed it, or wants it once more before they commit, taps here. */}
        <Button
          size="lg"
          variant="secondary"
          className="mt-3 h-12 w-full text-base"
          onClick={replay}
        >
          <SpeakerHigh className="size-5" weight="fill" aria-hidden />
          {phase === "tone" ? "듣는 중…" : "이 음 들어보기"}
        </Button>
      </div>

      {/* While the tone sounds, a bar fills for its length -- so "listen" has a visible end and
          nobody starts singing over the reference. Keyed on step so it restarts each note. */}
      <div className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div
          key={`${step}-${phase === "tone" ? "t" : "l"}`}
          className={cn(
            "h-full rounded-full bg-foreground/30",
            phase === "tone" ? "animate-tone-fill" : "w-0",
          )}
          style={phase === "tone" ? { animationDuration: `${TONE_MS}ms` } : undefined}
        />
      </div>

      {/* Always mounted, dimmed while the tone plays. Swapping this block in and out every
          couple of seconds was most of the flicker -- the eye reads a control appearing as
          something new to deal with, even when it is the same control it saw a moment ago. */}
      <div
        className={cn(
          "space-y-3 transition-opacity duration-200",
          phase === "listen" ? "opacity-100" : "pointer-events-none opacity-35",
        )}
      >
        <div className="px-1">
          <div className="relative h-9">
            <div className="absolute inset-x-0 top-4 h-1 rounded-full bg-secondary" />
            {/* The window that counts as a match, so the target reads as a zone, not a point. */}
            <div
              className="absolute top-4 h-1 rounded-full bg-primary/25"
              style={{
                left: `${50 - (TOLERANCE_CENTS / 300) * 50}%`,
                width: `${(TOLERANCE_CENTS / 300) * 100}%`,
              }}
            />
            <div className="absolute top-2 left-1/2 h-5 w-px -translate-x-1/2 bg-foreground/30" />
            <span
              className={cn(
                "absolute top-1 size-7 -translate-x-1/2 rounded-full border-2",
                "transition-[left,opacity,border-color] duration-100",
                heard > 0 ? "opacity-100" : "opacity-0",
                Math.abs(off) <= TOLERANCE_CENTS
                  ? "border-primary bg-primary/20"
                  : "border-muted-foreground/40 bg-background",
              )}
              style={{ left: `${50 + needle * 50}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[0.625rem] text-muted-foreground">
            <span className="w-10">낮음</span>
            {/* Fixed width: the note name changes length as the pitch moves, and letting it push
                the two edge labels around made the whole row twitch. */}
            <span className="w-28 text-center tabular-nums">
              {heard > 0 ? noteName(heard) : "음을 잡는 중…"}
            </span>
            <span className="w-10 text-right">높음</span>
          </div>
        </div>

        {/* Holding fills the bar. Six frames at 100ms is 0.6s, comfortably past the 0.28s the
            worker needs to call it a held note. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${Math.min(100, (hold / HOLD_FRAMES) * 100)}%` }}
          />
        </div>
      </div>

      {/* One slot, one message, reserved height. Three separately mounted notices meant the
          buttons below moved every time the state changed. */}
      <div className="flex min-h-[3.25rem] items-center justify-center">
        {quiet ? (
          <p className="w-full rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs leading-relaxed text-amber-700 dark:text-amber-500">
            소리가 안 들려요. 마이크에 가까이서 불러주세요.
          </p>
        ) : struggling ? (
          <p className="w-full rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs leading-relaxed text-amber-700 dark:text-amber-500">
            이 음이 잘 안 나오면 여기가 한계예요. 아래 버튼으로 끝내면 됩니다.
          </p>
        ) : falsetto ? (
          <p className="w-full rounded-lg bg-secondary/60 px-3 py-2 text-center text-xs leading-relaxed text-muted-foreground">
            지금부터 <span className="font-medium text-foreground">가성</span>으로 들려요. 곡 추천은
            진성 기준으로 해드립니다.
          </p>
        ) : comfortHz > 0 ? (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle className="size-3.5 text-primary" weight="fill" aria-hidden />
            편한 한계 <span className="font-medium text-foreground">{noteName(comfortHz)}</span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Button size="lg" variant={comfortHz > 0 ? "ghost" : "secondary"} onClick={markComfort}>
          <Warning className="size-4" aria-hidden />
          {comfortHz > 0 ? "여기로 다시 표시" : "여기부터 힘들어요"}
        </Button>
        <Button size="lg" variant={struggling ? "default" : "ghost"} onClick={finish}>
          <X className="size-4" aria-hidden />
          더 못 올라가겠어요
        </Button>
      </div>
    </div>
  );
}
