"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { formatSeconds } from "@/lib/format";
import type { Voice } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ResultPlayerProps {
  voice: Voice;
  title: string;
  durationSeconds: number;
  /** Signed URL, valid for an hour; null while the cover is still being generated. */
  audioUrl: string | null;
}

export function ResultPlayer({ voice, title, durationSeconds, audioUrl }: ResultPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
    setPlaying(!playing);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn("bg-gradient-to-br p-6 sm:p-8", voice.accent)}>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {voice.name} Cover
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>

        <div className="mt-6 flex items-center gap-4">
          <Button
            size="icon"
            className="size-14 rounded-full"
            aria-label={playing ? "일시정지" : "재생"}
            disabled={!audioUrl}
            onClick={toggle}
          >
            {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/15">
              <div
                className="h-full rounded-full bg-foreground/70 transition-[width]"
                style={{ width: `${durationSeconds ? (position / durationSeconds) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
              <span>{formatSeconds(position)}</span>
              <span>{formatSeconds(durationSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setPosition(0);
          }}
          className="hidden"
        />
      ) : null}

    </div>
  );
}
