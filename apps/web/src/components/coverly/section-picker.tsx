"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PREVIEW } from "@/lib/config";
import { formatSeconds } from "@/lib/format";

interface SectionPickerProps {
  objectUrl: string;
  durationSeconds: number;
  startSeconds: number;
  onStartChange: (start: number) => void;
}

/**
 * Free previews are a fixed 30 s window (PRD §8); the user only moves where it starts.
 * Playback is scoped to the chosen window so what they hear is what they will get.
 */
export function SectionPicker({
  objectUrl,
  durationSeconds,
  startSeconds,
  onStartChange,
}: SectionPickerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(startSeconds);

  const window = Math.min(PREVIEW.durationSeconds, durationSeconds);
  const maxStart = Math.max(0, durationSeconds - window);
  const end = startSeconds + window;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setPosition(audio.currentTime);
      if (audio.currentTime >= end) {
        audio.pause();
        audio.currentTime = startSeconds;
        setPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [end, startSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = startSeconds;
    setPosition(startSeconds);
    setPlaying(false);
  }, [startSeconds]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (audio.currentTime < startSeconds || audio.currentTime >= end) {
      audio.currentTime = startSeconds;
    }
    void audio.play();
    setPlaying(true);
  }

  const progress = Math.min(1, Math.max(0, (position - startSeconds) / window));

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">미리보기 구간</p>
        <p className="font-mono text-sm text-muted-foreground">
          {formatSeconds(startSeconds)} – {formatSeconds(end)}
        </p>
      </div>

      <div className="relative h-14 overflow-hidden rounded-lg bg-secondary/60">
        <div
          className="absolute inset-y-0 rounded-lg bg-primary/20 ring-1 ring-primary/50"
          style={{
            left: `${(startSeconds / durationSeconds) * 100}%`,
            width: `${(window / durationSeconds) * 100}%`,
          }}
        />
        <div
          className="absolute inset-y-0 w-px bg-primary transition-[left] duration-100"
          style={{
            left: `${((startSeconds + progress * window) / durationSeconds) * 100}%`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex items-end justify-between gap-px px-1 pb-1 opacity-40">
          {Array.from({ length: 56 }).map((_, index) => (
            <span
              key={index}
              className="w-full rounded-full bg-foreground/50"
              style={{ height: `${18 + Math.abs(Math.sin(index * 1.7)) * 60}%` }}
            />
          ))}
        </div>
      </div>

      <Slider
        value={[startSeconds]}
        min={0}
        max={maxStart}
        step={1}
        onValueChange={([next]) => onStartChange(next)}
        aria-label="미리보기 시작 지점"
      />

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={toggle}>
          {playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {playing ? "일시정지" : "구간 듣기"}
        </Button>
        <p className="text-xs text-muted-foreground">
          무료 미리보기는 {PREVIEW.durationSeconds}초로 고정됩니다
        </p>
      </div>

      <audio ref={audioRef} src={objectUrl} preload="metadata" className="hidden" />
    </div>
  );
}
