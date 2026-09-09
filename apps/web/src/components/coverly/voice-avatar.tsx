import { cn } from "@/lib/utils";

/**
 * A generated portrait for each voice, instead of a letter in a box.
 *
 * There is no artwork to ship yet and stock imagery would be worse than nothing, so the mark is
 * derived from the voice id: the same id always produces the same hue and the same waveform, and
 * two voices never look alike. It scales to any size and costs no network request.
 */
function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const BAR_COUNT = 7;

export function VoiceAvatar({
  voiceId,
  name,
  className,
}: {
  voiceId: string;
  name: string;
  className?: string;
}) {
  const seed = hash(voiceId);
  // Spread hues around the wheel but keep them off the coral accent so the UI still has one
  // primary; these are identity marks, not interface colour.
  const hue = (seed % 12) * 30;
  const bars = Array.from({ length: BAR_COUNT }, (_, index) => {
    const wave = Math.abs(Math.sin(seed * 0.37 + index * 1.21));
    return 0.24 + wave * 0.68;
  });
  const gradientId = `va-${voiceId}`;

  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${name} 이미지`}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`oklch(0.86 0.09 ${hue})`} />
          <stop offset="100%" stopColor={`oklch(0.72 0.13 ${(hue + 42) % 360})`} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${gradientId})`} />
      <g stroke="oklch(0.99 0.005 90)" strokeWidth="3.2" strokeLinecap="round" opacity="0.92">
        {bars.map((height, index) => {
          const x = 9 + index * 5;
          const half = (height * 30) / 2;
          return <line key={index} x1={x} y1={24 - half} x2={x} y2={24 + half} />;
        })}
      </g>
    </svg>
  );
}
