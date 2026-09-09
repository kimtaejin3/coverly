"use client";

import { useState } from "react";
import { CircleNotch, LinkSimple, MusicNote, X, YoutubeLogo } from "@phosphor-icons/react";
import { toast } from "sonner";

import { UploadDropzone, type UploadedSong } from "@/components/coverly/upload-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { YOUTUBE_ENABLED } from "@/lib/config";
import { parseYouTubeUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/** A YouTube link the worker has already fetched, so it behaves exactly like an upload. */
export interface ResolvedYouTube {
  /** Object path in the private uploads bucket; the generate call reuses it. */
  path: string;
  audioUrl: string;
  durationSeconds: number;
  canonicalUrl: string;
}

export function SourcePicker({
  song,
  onSong,
  youtubeUrl,
  onYoutubeUrl,
  resolved,
  onResolved,
  tab,
  onTab,
}: {
  song: UploadedSong | null;
  onSong: (next: UploadedSong | null) => void;
  youtubeUrl: string;
  onYoutubeUrl: (next: string) => void;
  resolved: ResolvedYouTube | null;
  onResolved: (next: ResolvedYouTube | null) => void;
  tab: "file" | "youtube";
  onTab: (next: "file" | "youtube") => void;
}) {
  const [fetching, setFetching] = useState(false);
  const [touched, setTouched] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const parsed = youtubeUrl.trim() ? parseYouTubeUrl(youtubeUrl) : null;
  const invalid = touched && youtubeUrl.trim().length > 0 && !parsed;

  async function fetchAudio() {
    if (!parsed) return;
    setFetching(true);
    try {
      const response = await fetch("/api/youtube/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.url }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // YouTube blocks a good share of requests from datacenter IPs, so this is a normal
        // outcome rather than an exception: keep the user moving instead of just apologising.
        setBlocked(true);
        toast.error(data.error ?? "영상을 가져오지 못했어요.");
        return;
      }
      setBlocked(false);
      onResolved({
        path: data.path,
        audioUrl: data.audioUrl,
        durationSeconds: data.durationSeconds,
        canonicalUrl: data.canonicalUrl,
      });
    } catch {
      toast.error("영상을 가져오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setFetching(false);
    }
  }

  // With the import switched off there is only one source, and a single-tab tab strip is noise.
  if (!YOUTUBE_ENABLED) {
    return <UploadDropzone value={song} onChange={onSong} />;
  }

  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/70 p-1">
        {(
          [
            ["file", "파일 올리기"],
            ["youtube", "YouTube"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === value
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "file" ? (
        <UploadDropzone value={song} onChange={onSong} />
      ) : resolved ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <MusicNote className="size-4.5 text-primary" weight="fill" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">YouTube 음원</p>
            <p className="text-xs text-muted-foreground">
              {Math.floor(resolved.durationSeconds / 60)}분{" "}
              {Math.round(resolved.durationSeconds % 60)}초 · 아래에서 구간을 골라 들어보세요
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="가져온 음원 제거"
            onClick={() => onResolved(null)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <LinkSimple
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={youtubeUrl}
              onChange={(event) => onYoutubeUrl(event.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && parsed && !fetching) {
                  event.preventDefault();
                  void fetchAudio();
                }
              }}
              inputMode="url"
              placeholder="https://www.youtube.com/watch?v=..."
              aria-label="YouTube 영상 주소"
              aria-invalid={invalid}
              className="pl-9"
            />
          </div>

          {invalid ? (
            <p className="text-sm text-destructive">YouTube 영상 주소를 확인해 주세요.</p>
          ) : null}

          <Button
            className="w-full"
            disabled={!parsed || fetching}
            onClick={fetchAudio}
          >
            {fetching ? (
              <CircleNotch className="size-4 animate-spin" aria-hidden />
            ) : (
              <YoutubeLogo className="size-4" weight="fill" aria-hidden />
            )}
            {fetching ? "가져오는 중… 30초쯤 걸려요" : "음원 가져오기"}
          </Button>

          {blocked ? (
            <div className="space-y-2 rounded-lg bg-destructive/8 px-3 py-3">
              <p className="text-xs leading-relaxed text-foreground">
                YouTube가 이 영상의 요청을 막았습니다. 영상마다 다르게 나타나며 다른 주소로는 될
                수 있어요.
              </p>
              <Button variant="secondary" size="sm" className="w-full" onClick={() => onTab("file")}>
                파일로 올리기
              </Button>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              가져온 뒤 들어보고 구간을 고를 수 있어요. 처리할 권한이 있는 영상만 사용해 주세요.
              영상에 따라 YouTube가 요청을 막을 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
