"use client";

import { useRef, useState } from "react";
import { Check, Copy, DownloadSimple, Pause, Play } from "@phosphor-icons/react";
import { toast } from "sonner";

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
  /**
   * Path with the share token. Copying the address bar instead would hand out a link that only
   * works for the owner, which is the opposite of what the button promises.
   */
  shareUrl?: string;
  /**
   * Download and copy-link. Off for someone who arrived by a shared link: the link is meant to let
   * them listen, and handing them the file and a re-share button is a distribution the owner did
   * not ask for.
   */
  showActions?: boolean;
}

export function ResultPlayer({
  voice,
  title,
  durationSeconds,
  audioUrl,
  shareUrl,
  showActions = true,
}: ResultPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [copied, setCopied] = useState(false);

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

  async function copyLink() {
    const link = shareUrl ? new URL(shareUrl, window.location.origin).toString() : window.location.href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("링크를 복사했어요. 받은 사람은 로그인 없이 들을 수 있어요.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("복사하지 못했어요. 주소창의 링크를 직접 복사해 주세요.");
    }
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

      {showActions ? (
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <Button variant="secondary" asChild={Boolean(audioUrl)} disabled={!audioUrl}>
          {audioUrl ? (
            <a href={audioUrl} download={`${title}.mp3`}>
              <DownloadSimple className="size-4" aria-hidden />
              다운로드
            </a>
          ) : (
            <span>
              <DownloadSimple className="size-4" aria-hidden />
              다운로드
            </span>
          )}
        </Button>
        <Button variant="secondary" onClick={copyLink}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          링크 복사
        </Button>
      </div>
      ) : null}
    </div>
  );
}
