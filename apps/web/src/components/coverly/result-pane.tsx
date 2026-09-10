"use client";

import Link from "next/link";
import { ArrowRight, CircleNotch, Info, MusicNotes, WaveTriangle } from "@phosphor-icons/react";

import { AiNotice } from "@/components/coverly/ai-notice";
import { GeneratingPanel } from "@/components/coverly/generating-panel";
import { ResultPlayer } from "@/components/coverly/result-player";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PREVIEW, PRICING } from "@/lib/config";
import { formatKrw } from "@/lib/format";
import type { Voice } from "@/lib/types";

export type PaneState =
  | { kind: "idle" }
  | { kind: "ready"; voice: Voice; fileName: string; startSeconds: number }
  | { kind: "generating"; coverId: string; audioSeconds?: number }
  | {
      kind: "done";
      coverId: string;
      voice: Voice;
      title: string;
      audioUrl: string | null;
      shareUrl: string | null;
    };

/**
 * The right half of the workspace. It always shows something: an empty state that explains the
 * product, a summary of what is about to be made, live progress, or the finished cover. A blank
 * pane would make the app look broken before the first upload.
 */
export function ResultPane({
  state,
  canGenerateFull = false,
  onMakeFull,
  makingFull = false,
  onDone,
  onFailed,
}: {
  state: PaneState;
  /** Whether this account may ask for a whole song rather than the preview. */
  canGenerateFull?: boolean;
  onMakeFull?: () => void;
  makingFull?: boolean;
  onDone: (audioUrl: string | null, shareUrl: string | null) => void;
  onFailed: (message: string) => void;
}) {
  if (state.kind === "generating") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <GeneratingPanel
          coverId={state.coverId}
          audioSeconds={state.audioSeconds}
          onDone={onDone}
          onFailed={onFailed}
        />
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <AiNotice />
        <ResultPlayer
          voice={state.voice}
          title={state.title}
          durationSeconds={PREVIEW.durationSeconds}
          audioUrl={state.audioUrl}
          shareUrl={state.shareUrl ?? undefined}
        />

        <div className="rounded-2xl bg-primary/8 p-5">
          <h2 className="font-medium">전체 곡으로 만들기</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            지금은 {PREVIEW.durationSeconds}초 미리보기예요. 곡 전체를 같은 Voice로 완성할 수 있습니다.
          </p>
          {canGenerateFull ? (
            <>
              <Button className="mt-4 h-11 w-full" onClick={onMakeFull} disabled={makingFull}>
                {makingFull ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : null}
                {makingFull ? "시작하는 중…" : "전체 곡 만들기"}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                올린 파일을 그대로 씁니다. 길이에 따라 몇 분 걸려요.
              </p>
            </>
          ) : (
            <>
              <Button className="mt-4 h-11 w-full" disabled>
                전체 곡 만들기 · {formatKrw(PRICING.fullCoverKrw)}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                결제 기능은 준비 중입니다
              </p>
            </>
          )}
        </div>

        <Alert>
          <Info className="size-4" aria-hidden />
          <AlertDescription className="leading-relaxed">
            내려받은 파일을 외부에 올릴 때는 원곡의 권리 관계를 직접 확인해 주세요. 공개와 배포의
            책임은 이용자에게 있습니다.
          </AlertDescription>
        </Alert>

        <Button asChild variant="ghost" className="w-full">
          <Link href={state.shareUrl ?? `/c/${state.coverId}`}>
            이 커버 링크 열기 <ArrowRight className="size-3.5" weight="bold" aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl bg-card p-6">
          <p className="text-xs text-muted-foreground">만들 준비가 됐어요</p>
          <h2 className="mt-2 truncate text-xl font-medium">{state.fileName}</h2>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Voice</dt>
              <dd className="font-medium">{state.voice.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">구간</dt>
              <dd className="tabular font-mono">
                {Math.floor(state.startSeconds / 60)}:
                {String(Math.round(state.startSeconds % 60)).padStart(2, "0")} 부터{" "}
                {PREVIEW.durationSeconds}초
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">비용</dt>
              <dd className="font-medium text-primary">무료</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            왼쪽의 생성 버튼을 누르면 시작합니다. 완성되면 여기에서 바로 들을 수 있어요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-10 text-center">
      <div
        aria-hidden
        className="flex size-16 items-center justify-center rounded-2xl bg-secondary/60"
      >
        <WaveTriangle className="size-7 text-primary" weight="duotone" />
      </div>
      <h2 className="mt-6 text-2xl font-medium">좋아하는 노래를 새로운 목소리로</h2>
      <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
        왼쪽에서 음원을 올리고 Voice를 고르면 {PREVIEW.durationSeconds}초 커버를 무료로 만들어
        드려요. 만든 커버는 본인만 볼 수 있습니다.
      </p>
      <ol className="mt-8 w-full space-y-3 text-left">
        {[
          "가지고 있는 음원을 올립니다",
          "샘플을 듣고 Voice를 고릅니다",
          "완성된 커버를 듣고 내려받습니다",
        ].map((label, index) => (
          <li key={label} className="flex items-center gap-3 rounded-xl bg-card/60 px-4 py-3">
            <span className="tabular font-mono text-xs text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="text-sm">{label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-8 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <MusicNotes className="size-3.5" aria-hidden />
        MP3, WAV, M4A · 최대 50MB · 5분 이내
      </p>
    </div>
  );
}
