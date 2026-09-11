"use client";

import { RANGE_LANDMARKS, noteName, rangePosition } from "@/lib/pitch";
import { cn } from "@/lib/utils";

/**
 * Where a voice sits, against the notes songs actually ask for.
 *
 * "음역 9반음" tells a singer nothing on its own -- it is a width with no position. What decides
 * which songs work is where the top of that range lands, so the scale is drawn with the landmarks
 * on it and the singer's own span laid over them.
 *
 * The top of a range is really two places. `comfortHz` is where it stops being easy and `highHz`
 * is where it stops; the stretch between them is drawn faded, because that is exactly how those
 * notes feel to sing.
 */
export function RangeGauge({
  lowHz,
  highHz,
  comfortHz = 0,
  currentHz = 0,
  className,
}: {
  lowHz: number;
  highHz: number;
  /** Where the singer marked the limit of easy. Omit to draw one solid bar as before. */
  comfortHz?: number;
  currentHz?: number;
  className?: string;
}) {
  const hasRange = lowHz > 0 && highHz > 0;
  const split = comfortHz > lowHz && comfortHz < highHz ? comfortHz : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">
          {currentHz > 0 ? (
            <>
              지금 <span className="font-medium text-foreground">{noteName(currentHz)}</span>
            </>
          ) : hasRange ? (
            "내 음역"
          ) : (
            "음을 잡는 중…"
          )}
        </span>
        {hasRange ? (
          <span className="font-medium">
            {noteName(lowHz)} ~ {split ? `${noteName(split)} ` : ""}
            {split ? <span className="text-muted-foreground">({noteName(highHz)})</span> : noteName(highHz)}
          </span>
        ) : null}
      </div>

      <div className="relative h-6">
        {/* The track, with the landmark notes marked on it. */}
        <div className="absolute inset-x-0 top-2 h-1.5 rounded-full bg-secondary" />
        {hasRange ? (
          <>
            {/* The strained stretch sits underneath and runs the full width, so the solid bar
                drawn over it reads as "this much is easy". */}
            <div
              className="absolute top-2 h-1.5 rounded-full bg-primary/30"
              style={{
                left: `${rangePosition(lowHz) * 100}%`,
                width: `${Math.max(2, (rangePosition(highHz) - rangePosition(lowHz)) * 100)}%`,
              }}
            />
            <div
              className="absolute top-2 h-1.5 rounded-full bg-primary"
              style={{
                left: `${rangePosition(lowHz) * 100}%`,
                width: `${Math.max(
                  2,
                  (rangePosition(split || highHz) - rangePosition(lowHz)) * 100,
                )}%`,
              }}
            />
          </>
        ) : null}
        {RANGE_LANDMARKS.map((mark) => (
          <span
            key={mark.label}
            title={`${mark.label} · ${mark.note}`}
            className="absolute top-0.5 h-4 w-px bg-foreground/25"
            style={{ left: `${rangePosition(mark.hz) * 100}%` }}
          />
        ))}
        {currentHz > 0 ? (
          <span
            className="absolute top-0 h-5 w-0.5 rounded-full bg-foreground transition-[left] duration-100"
            style={{ left: `${rangePosition(currentHz) * 100}%` }}
          />
        ) : null}
      </div>

      <div className="flex justify-between text-[0.625rem] text-muted-foreground">
        <span>1옥타브 도</span>
        <span>2옥타브 라</span>
        <span>3옥타브 솔</span>
      </div>
    </div>
  );
}
