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
/**
 * YIN pitch detection.
 *
 * This was plain autocorrelation picking the highest peak, and it was wrong about nine notes in
 * fifteen -- it read 196 Hz as 98 and 523 Hz as 75. Autocorrelation peaks at the period and again
 * at every multiple of it, and the score here was divided by `length - lag`, which grows the score
 * as the lag gets longer. That put a thumb on the scale for exactly the wrong peaks, so it kept
 * picking a subharmonic: the note an octave or two below the one being sung.
 *
 * YIN's cumulative mean normalisation exists to solve that specific problem. The difference
 * function is divided by the running mean of itself, which pushes the value at the true period
 * below the values at its multiples instead of above them, and then the first dip under the
 * threshold wins rather than the deepest one anywhere.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return 0;

  const minLag = Math.max(2, Math.floor(sampleRate / 1200));
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(buffer.length / 2));
  if (maxLag <= minLag) return 0;

  // Squared difference at each candidate period. Half the window is plenty for a pitch and keeps
  // this inside a 100 ms frame on the main thread.
  const window = Math.floor(buffer.length / 2);
  const diff = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let total = 0;
    for (let i = 0; i < window; i += 1) {
      const delta = buffer[i] - buffer[i + lag];
      total += delta * delta;
    }
    diff[lag] = total;
  }

  // Cumulative mean normalised difference: d[lag] over the running mean of d up to lag.
  const norm = new Float32Array(maxLag + 1);
  let running = 0;
  norm[minLag] = 1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    running += diff[lag];
    norm[lag] = running > 0 ? (diff[lag] * (lag - minLag + 1)) / running : 1;
  }

  const THRESHOLD = 0.15;
  let chosen = -1;
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    if (norm[lag] < THRESHOLD) {
      // Walk to the bottom of this dip rather than taking its leading edge.
      while (lag + 1 < maxLag && norm[lag + 1] < norm[lag]) lag += 1;
      chosen = lag;
      break;
    }
  }
  if (chosen < 0) {
    // Nothing crossed the threshold. Take the best dip anyway, but only if it is convincing --
    // otherwise this is noise and the caller should hear silence, not a guess.
    let best = minLag + 1;
    for (let lag = minLag + 1; lag < maxLag; lag += 1) if (norm[lag] < norm[best]) best = lag;
    if (norm[best] > 0.6) return 0;
    chosen = best;
  }

  // Parabolic interpolation around the dip: a lag is an integer number of samples, and at 500 Hz
  // one sample is already a third of a semitone.
  const a = norm[chosen - 1];
  const b = norm[chosen];
  const c = norm[chosen + 1] ?? b;
  const shift = a + c - 2 * b !== 0 ? (a - c) / (2 * (a + c - 2 * b)) : 0;
  const f0 = sampleRate / (chosen + shift);
  return f0 > 70 && f0 < 1200 ? f0 : 0;
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
