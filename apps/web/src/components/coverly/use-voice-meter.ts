"use client";

import { useCallback, useRef, useState } from "react";

/** Matches the worker's floor: below this the recording is rejected after upload. */
export const TARGET_SEMITONES = 12;

export interface Meter {
  level: number;
  semitones: number;
  lowHz: number;
  highHz: number;
}

const EMPTY: Meter = { level: 0, semitones: 0, lowHz: 0, highHz: 0 };

/**
 * Autocorrelation pitch detection over the live input.
 *
 * The worker rejects a take that stays in one register, and finding that out after the upload
 * wastes the singer's time. Showing the range as they sing turns "낮은 키로 한 번, 높은 키로 한 번"
 * from an instruction into something they can watch themselves satisfy.
 */
function detectPitch(buffer: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return 0;

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(buffer.length / 2));
  let bestLag = -1;
  let bestScore = 0;
  for (let lag = minLag; lag < maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < buffer.length - lag; i += 2) sum += buffer[i] * buffer[i + lag];
    const score = sum / (buffer.length - lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // A clear pitch correlates with itself far more strongly than noise does.
  if (bestLag < 0 || bestScore < rms * rms * 0.3) return 0;
  const f0 = sampleRate / bestLag;
  return f0 > 70 && f0 < 1000 ? f0 : 0;
}

export function useVoiceMeter() {
  const [meter, setMeter] = useState<Meter>(EMPTY);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pitchesRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }, []);

  const start = useCallback((stream: MediaStream) => {
    stop();
    pitchesRef.current = [];
    setMeter(EMPTY);

    const context = new AudioContext();
    contextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    context.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    // 10 Hz: fast enough to feel live, slow enough that autocorrelation stays off the main
    // thread's critical path.
    timerRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 6);

      const f0 = detectPitch(buffer, context.sampleRate);
      if (f0 > 0) pitchesRef.current.push(f0);

      const pitches = pitchesRef.current;
      if (pitches.length < 12) {
        setMeter({ level, semitones: 0, lowHz: 0, highHz: 0 });
        return;
      }
      // Percentiles, not min/max: one cracked note should not read as an octave of range.
      const sorted = [...pitches].sort((a, b) => a - b);
      const low = sorted[Math.floor(sorted.length * 0.1)];
      const high = sorted[Math.floor(sorted.length * 0.9)];
      setMeter({
        level,
        semitones: low > 0 ? 12 * Math.log2(high / low) : 0,
        lowHz: low,
        highHz: high,
      });
    }, 100);
  }, [stop]);

  const reset = useCallback(() => {
    pitchesRef.current = [];
    setMeter(EMPTY);
  }, []);

  return { meter, start, stop, reset };
}
