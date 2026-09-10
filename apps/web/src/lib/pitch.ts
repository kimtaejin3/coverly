export const KOR = ["도", "도#", "레", "레#", "미", "파", "파#", "솔", "솔#", "라", "라#", "시"];

/**
 * Hz to the octave notation Korean singers actually use, where C3 reads as "1옥타브 도".
 * Scientific pitch calls that same note C3, so the octave number is shifted by two.
 */
export function noteName(hz: number): string {
  if (!hz || hz <= 0) return "-";
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const octave = Math.floor(midi / 12) - 3;
  return `${octave}옥타브 ${KOR[((midi % 12) + 12) % 12]}`;
}

export function semitonesBetween(from: number, to: number): number {
  if (from <= 0 || to <= 0) return 0;
  return 12 * Math.log2(to / from);
}

/** Hz for a note written the Korean way, e.g. ("라", 2) for 2옥타브 라. */
export function noteHz(name: string, octave: number): number {
  const index = KOR.indexOf(name);
  if (index < 0) return 0;
  const midi = (octave + 3) * 12 + index;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Landmarks a singer can place themselves against.
 *
 * Deliberately not split by gender: the app never asks, and guessing from a first few seconds of
 * pitch would be wrong often enough to matter. These are the notes songs actually ask for, which
 * is the thing being decided.
 */
export const RANGE_LANDMARKS = [
  { hz: 130.81, label: "1옥타브 도", note: "남성 저음" },
  { hz: 261.63, label: "2옥타브 도", note: "남성 편한 고음" },
  { hz: 440.0, label: "2옥타브 라", note: "발라드 후렴 최고음" },
  { hz: 523.25, label: "3옥타브 도", note: "고음곡" },
  { hz: 783.99, label: "3옥타브 솔", note: "최상위" },
] as const;

/** Position of a pitch on a log scale from C3 to G5, as 0..1. */
export function rangePosition(hz: number): number {
  const low = 130.81;
  const high = 783.99;
  if (hz <= 0) return 0;
  return Math.max(0, Math.min(1, Math.log2(hz / low) / Math.log2(high / low)));
}
