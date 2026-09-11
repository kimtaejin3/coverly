"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch, Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

import { ResultPane, type PaneState } from "@/components/coverly/result-pane";
import { SectionPicker } from "@/components/coverly/section-picker";
import { CouponForm } from "@/components/coverly/coupon-form";
import { SongFinder } from "@/components/coverly/song-finder";
import { MyVoice, asVoice, type PersonalVoice } from "@/components/coverly/my-voice";
import { SourcePicker, type ResolvedYouTube } from "@/components/coverly/source-picker";
import type { UploadedSong } from "@/components/coverly/upload-dropzone";
import { Button } from "@/components/ui/button";
import { PREVIEW, UPLOAD, YOUTUBE_ENABLED } from "@/lib/config";
import type { RecentCover } from "@/lib/supabase/queries";
import type { Voice } from "@/lib/types";

function Field({ step, label, children }: { step: number; label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <span className="tabular font-mono text-xs text-muted-foreground">
          {String(step).padStart(2, "0")}
        </span>
        {label}
      </h2>
      {children}
    </section>
  );
}

export function Workspace({
  signedIn,
  recent,
  personalVoices,
}: {
  signedIn: boolean;
  recent: RecentCover[];
  personalVoices: PersonalVoice[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [song, setSong] = useState<UploadedSong | null>(null);
  const [startSeconds, setStartSeconds] = useState(PREVIEW.defaultStartSeconds);
  // Catalogue voices are not selectable until they ship, so a ?voice=aria link must not
  // pre-select one behind the disabled picker.
  // The source that produced the last cover, so "전체 곡" can reuse the upload instead of asking
  // for the file again.
  const [lastSource, setLastSource] = useState<{ path: string; title: string } | null>(null);
  // Whether the run in flight is a whole song, so the progress bar is paced for it.
  const [fullRun, setFullRun] = useState(false);
  // Only the owner's own voices exist now, so a ?voice= link means something only when it names
  // one of them.
  const requestedVoice = params.get("voice");
  const [voiceId, setVoiceId] = useState<string | null>(
    requestedVoice && personalVoices.some((v) => v.id === requestedVoice) ? requestedVoice : null,
  );
  const [coverId, setCoverId] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    id: string;
    title: string;
    audioUrl: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<"file" | "youtube">("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [resolved, setResolved] = useState<ResolvedYouTube | null>(null);

  // Both tabs end up with the same thing: an audio URL and a duration. Everything downstream —
  // the waveform, the section slider, the generate call — stops caring where it came from.
  const audio =
    tab === "file"
      ? song
        ? { url: song.objectUrl, durationSeconds: song.durationSeconds }
        : null
      : resolved
        ? { url: resolved.audioUrl, durationSeconds: resolved.durationSeconds }
        : null;
  const hasSource = Boolean(audio);
  const sourceLabel = tab === "file" ? (song?.file.name ?? "") : "YouTube 음원";

  const selectedPersonal = personalVoices.find((v) => v.id === voiceId);

  // Personal voices are not catalogue rows; give the summary and result panes the shape they
  // expect.
  const voice = useMemo(
    () => (selectedPersonal ? asVoice(selectedPersonal) : null),
    [selectedPersonal],
  );

  const handleUpload = useCallback((next: UploadedSong | null) => {
    setSong(next);
    setFinished(null);
    if (next) {
      const maxStart = Math.max(0, next.durationSeconds - PREVIEW.durationSeconds);
      setStartSeconds(Math.min(PREVIEW.defaultStartSeconds, maxStart));
    }
  }, []);

  /**
   * Uploads straight from the browser to Supabase Storage. Routing the file through our own API
   * hit Vercel's 4.5 MB request-body cap and failed on almost every real song, even though the
   * product advertises 50 MB.
   */
  async function uploadSong(file: File): Promise<string | null> {
    const signed = await fetch("/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, size: file.size }),
    });
    const info = await signed.json().catch(() => ({}));
    if (!signed.ok) {
      toast.error(info.error ?? "업로드를 준비하지 못했어요.");
      return null;
    }

    const supabase = createClient();
    const { error } = await supabase.storage
      .from("uploads")
      .uploadToSignedUrl(info.path, info.token, file, { contentType: file.type });
    if (error) {
      toast.error("업로드에 실패했어요. 다시 시도해 주세요.");
      return null;
    }
    return info.path as string;
  }

  // Set when the API turns a generation away for quota, so the coupon field opens itself instead
  // of leaving the person to find it.
  const [outOfQuota, setOutOfQuota] = useState(false);

  async function startGeneration({ full = false }: { full?: boolean } = {}) {
    // A full-length run reuses the file the preview already put in storage; only a fresh preview
    // has to upload anything.
    if (!voiceId) return;
    if (!full && !hasSource) return;
    if (full && !lastSource) return;
    setSubmitting(true);
    try {
      let sourcePath: string | null = full ? lastSource!.path : null;
      let title = full ? lastSource!.title : "";
      if (!full) {
        if (tab === "file" && song) {
          sourcePath = await uploadSong(song.file);
          if (!sourcePath) return;
          title = song.file.name.replace(/\.[^.]+$/, "");
        } else if (resolved) {
          // Already in storage from the preview fetch; nothing to upload.
          sourcePath = resolved.path;
          title = resolved.canonicalUrl;
        }
      }
      if (!sourcePath) return;

      const path: string = sourcePath;
      const body = new FormData();
      body.set("sourcePath", path);
      if (full || (tab === "file" && song)) {
        body.set("title", title);
      } else if (resolved) {
        body.set("youtubeUrl", resolved.canonicalUrl);
      }
      body.set("voiceId", voiceId);
      body.set("startSeconds", String(Math.round(startSeconds)));
      if (full) body.set("full", "1");
      setLastSource({ path, title });

      const response = await fetch("/api/covers", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "quota_exhausted") setOutOfQuota(true);
        toast.error(data.error ?? "생성을 시작하지 못했어요.");
        return;
      }
      setFinished(null);
      setFullRun(full);
      setCoverId(data.coverId);
    } catch {
      toast.error("네트워크 오류로 생성을 시작하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  const paneState: PaneState = finished
    ? {
        kind: "done",
        coverId: finished.id,
        voice: voice!,
        title: finished.title,
        audioUrl: finished.audioUrl,
      }
    : coverId
      ? {
          kind: "generating",
          coverId,
          audioSeconds: fullRun ? UPLOAD.maxDurationSeconds : PREVIEW.durationSeconds,
        }
      : hasSource && voice
        ? { kind: "ready", voice, fileName: sourceLabel, startSeconds }
        : { kind: "idle" };

  const blocker = !hasSource
    ? tab === "file"
      ? "노래를 올려주세요"
      : "YouTube 음원을 가져와 주세요"
    : !voiceId
      ? "내 목소리를 먼저 만들어주세요"
      : null;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 lg:grid-cols-[22rem_1fr] lg:gap-10 lg:px-6">
      {/* Controls. Sticky on desktop so the result can scroll independently of the form. */}
      <aside className="scroll-subtle min-w-0 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2">
        <div className="space-y-7">
          <Field step={1} label={YOUTUBE_ENABLED ? "노래 가져오기" : "노래 올리기"}>
            <SourcePicker
              song={song}
              onSong={handleUpload}
              youtubeUrl={youtubeUrl}
              onYoutubeUrl={(next) => {
                setYoutubeUrl(next);
                setFinished(null);
              }}
              resolved={resolved}
              onResolved={(next) => {
                setResolved(next);
                setFinished(null);
                if (next) {
                  const maxStart = Math.max(0, next.durationSeconds - PREVIEW.durationSeconds);
                  setStartSeconds(Math.min(PREVIEW.defaultStartSeconds, maxStart));
                }
              }}
              tab={tab}
              onTab={setTab}
            />
          </Field>

          <Field step={2} label="구간 고르기">
            {audio ? (
              <SectionPicker
                objectUrl={audio.url}
                durationSeconds={audio.durationSeconds}
                startSeconds={startSeconds}
                onStartChange={setStartSeconds}
              />
            ) : (
              <p className="rounded-xl bg-card/50 px-4 py-5 text-sm text-muted-foreground">
                {tab === "file"
                  ? `노래를 올리면 ${PREVIEW.durationSeconds}초 구간을 고를 수 있어요.`
                  : `음원을 가져오면 ${PREVIEW.durationSeconds}초 구간을 고를 수 있어요.`}
              </p>
            )}
          </Field>

          <div className="mb-5">
            <SongFinder
              comfortHigh={
                selectedPersonal?.f0_comfort_high ?? personalVoices[0]?.f0_comfort_high ?? null
              }
              absoluteHigh={
                selectedPersonal?.f0_absolute_high ??
                personalVoices[0]?.f0_absolute_high ??
                selectedPersonal?.f0_peak ??
                personalVoices[0]?.f0_peak ??
                null
              }
            />
          </div>

          <Field step={3} label="목소리 고르기">
            <MyVoice
              initial={personalVoices}
              selectedId={voiceId}
              onSelect={(next) => setVoiceId(next.id)}
              signedIn={signedIn}
            />
          </Field>

          <div className="sticky bottom-0 -mx-1 bg-background/95 px-1 pt-3 pb-1 backdrop-blur-sm">
            {signedIn ? (
              <Button
                size="lg"
                className="h-12 w-full text-base"
                disabled={Boolean(blocker) || submitting || Boolean(coverId)}
                onClick={() => void startGeneration()}
              >
                {submitting ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkle className="size-4" weight="fill" aria-hidden />
                )}
                {submitting ? "음원 올리는 중…" : "커버 만들기"}
              </Button>
            ) : (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link href={`/login?next=${encodeURIComponent(voiceId ? `/?voice=${voiceId}` : "/")}`}>
                  로그인하고 만들기
                </Link>
              </Button>
            )}
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {blocker ?? `${voice?.name} · ${PREVIEW.durationSeconds}초 미리보기`}
            </p>
            {signedIn ? (
              <div className="mt-2 flex justify-center">
                <CouponForm defaultOpen={outOfQuota} />
              </div>
            ) : null}
          </div>

          {recent.length > 0 ? (
            <section className="space-y-2 border-t border-border/60 pt-6">
              <h2 className="text-sm font-medium">최근 만든 커버</h2>
              <ul className="space-y-1">
                {recent.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/c/${item.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-secondary/70"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.title || "제목 없음"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.status === "completed"
                          ? "완료"
                          : item.status === "failed"
                            ? "실패"
                            : "생성 중"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 lg:border-l lg:border-border/60 lg:pl-10">
        <ResultPane
          state={paneState}
          onDone={(audioUrl) => {
            const id = coverId;
            setCoverId(null);
            if (id) {
              setFinished({
                id,
                title:
                  tab === "file"
                    ? (song?.file.name.replace(/\.[^.]+$/, "") ?? "내 커버")
                    : "YouTube 커버",
                audioUrl,
              });
              router.refresh();
            }
          }}
          onFailed={(message) => {
            setCoverId(null);
            toast.error(message);
          }}
        />
      </div>
    </div>
  );
}
