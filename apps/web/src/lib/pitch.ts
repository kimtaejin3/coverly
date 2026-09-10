const KOR = ["도", "도#", "레", "레#", "미", "파", "파#", "솔", "솔#", "라", "라#", "시"];

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
