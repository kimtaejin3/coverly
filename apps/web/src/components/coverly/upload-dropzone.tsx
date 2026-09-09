"use client";

import { useRef, useState } from "react";
import { FileAudio, UploadSimple, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { UPLOAD } from "@/lib/config";
import { cn } from "@/lib/utils";

export interface UploadedSong {
  file: File;
  durationSeconds: number;
  objectUrl: string;
}

interface UploadDropzoneProps {
  value: UploadedSong | null;
  onChange: (song: UploadedSong | null) => void;
}

/** Reads duration in the browser so we can reject over-long files before any upload happens. */
function readDuration(file: File): Promise<{ durationSeconds: number; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("음원 길이를 읽을 수 없습니다. 다른 파일로 시도해 주세요."));
        return;
      }
      resolve({ durationSeconds: audio.duration, objectUrl });
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("오디오 파일로 읽을 수 없습니다."));
    };
    audio.src = objectUrl;
  });
}

export function UploadDropzone({ value, onChange }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(file: File | undefined) {
    setError(null);
    if (!file) {
      // A drop can carry text or an image; say so instead of appearing to ignore the gesture.
      setError("오디오 파일을 찾지 못했습니다. MP3, WAV, M4A 파일을 올려주세요.");
      return;
    }

    // Never trust the filename alone (PRD §42): check type, size, then real duration.
    const typeOk =
      UPLOAD.acceptedTypes.includes(file.type as (typeof UPLOAD.acceptedTypes)[number]) ||
      /\.(mp3|wav|m4a)$/i.test(file.name);
    if (!typeOk) {
      setError("MP3, WAV, M4A 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > UPLOAD.maxBytes) {
      setError(`파일이 너무 큽니다. ${Math.round(UPLOAD.maxBytes / 1024 / 1024)}MB 이하로 올려주세요.`);
      return;
    }

    try {
      const { durationSeconds, objectUrl } = await readDuration(file);
      if (durationSeconds > UPLOAD.maxDurationSeconds) {
        URL.revokeObjectURL(objectUrl);
        setError(`${Math.round(UPLOAD.maxDurationSeconds / 60)}분 이하의 음원만 올릴 수 있습니다.`);
        return;
      }
      if (value) URL.revokeObjectURL(value.objectUrl);
      onChange({ file, durationSeconds, objectUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "파일을 읽지 못했습니다.");
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <FileAudio className="size-4.5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.file.name}</p>
          <p className="text-xs text-muted-foreground">
            {Math.floor(value.durationSeconds / 60)}분 {Math.round(value.durationSeconds % 60)}초 ·{" "}
            {(value.file.size / 1024 / 1024).toFixed(1)}MB
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="파일 제거"
          onClick={() => {
            URL.revokeObjectURL(value.objectUrl);
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(event.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center transition-colors hover:border-primary/40 hover:bg-card/80",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-secondary">
          <UploadSimple className="size-4.5 text-primary" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-medium">파일을 올려주세요</p>
        <p className="mt-1 text-xs text-muted-foreground">끌어다 놓거나 눌러서 선택</p>
        <p className="mt-3 text-[11px] text-muted-foreground">{UPLOAD.acceptedLabel}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.m4a,audio/*"
        className="sr-only"
        onChange={(event) => void accept(event.target.files?.[0])}
      />
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
