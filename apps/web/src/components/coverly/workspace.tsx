"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleNotch, Sparkle } from "@phosphor-icons/react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

import { ResultPane, type PaneState } from "@/components/coverly/result-pane";
import { SectionPicker } from "@/components/coverly/section-picker";
import { MyVoice, type PersonalVoice } from "@/components/coverly/my-voice";
import { SourcePicker, type ResolvedYouTube } from "@/components/coverly/source-picker";
import type { UploadedSong } from "@/components/coverly/upload-dropzone";
import { VoicePicker } from "@/components/coverly/voice-picker";
import { Button } from "@/components/ui/button";
import { PREVIEW, YOUTUBE_ENABLED } from "@/lib/config";
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
  voices,
  signedIn,
  recent,
  personalVoice,
}: {
  voices: Voice[];
  signedIn: boolean;
  recent: RecentCover[];
  personalVoice: PersonalVoice | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [song, setSong] = useState<UploadedSong | null>(null);
  const [startSeconds, setStartSeconds] = useState(PREVIEW.defaultStartSeconds);
  const [voiceId, setVoiceId] = useState<string | null>(params.get("voice"));
  const [coverId, setCoverId] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    id: string;
    title: string;
    audioUrl: string | null;
    shareUrl: string | null;
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

  const voice = useMemo(() => {
    const found = voices.find((v) => v.id === voiceId);
    if (found) return found;
    // The personal voice is deliberately absent from the catalogue; synthesise enough of a Voice
    // for the summary and result panes to render.
    if (voiceId && personalVoice?.id === voiceId) {
      return {
        id: personalVoice.id,
        name: personalVoice.name,
        description: "내가 녹음한 목소리",
        gender: "female",
        tags: ["내 목소리"],
        sampleUrl: "",
        sampleTitle: "",
        rangeLabel: "",
        accent: "",
        sourceCredit: null,
        sourceLicense: null,
        isActive: true,
      } as Voice;
    }
    return null;
  }, [voices, voiceId, personalVoice]);

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

  async function startGeneration() {
    if (!hasSource || !voiceId) return;
    setSubmitting(true);
    try {
      let sourcePath: string | null = null;
      if (tab === "file" && song) {
        sourcePath = await uploadSong(song.file);
        if (!sourcePath) return;
      } else if (resolved) {
        // Already in storage from the preview fetch; nothing to upload.
        sourcePath = resolved.path;
      }
      if (!sourcePath) return;

      const body = new FormData();
      body.set("sourcePath", sourcePath);
      if (tab === "file" && song) {
        body.set("title", song.file.name.replace(/\.[^.]+$/, ""));
      } else if (resolved) {
        body.set("youtubeUrl", resolved.canonicalUrl);
      }
      body.set("voiceId", voiceId);
      body.set("startSeconds", String(Math.round(startSeconds)));

      const response = await fetch("/api/covers", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "생성을 시작하지 못했어요.");
        return;
      }
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
        voice: voice ?? voices[0],
        title: finished.title,
        audioUrl: finished.audioUrl,
        shareUrl: finished.shareUrl,
      }
    : coverId
      ? { kind: "generating", coverId }
      : hasSource && voice
        ? { kind: "ready", voice, fileName: sourceLabel, startSeconds }
        : { kind: "idle" };

  const blocker = !hasSource
    ? tab === "file"
      ? "노래를 올려주세요"
      : "YouTube 음원을 가져와 주세요"
    : !voiceId
      ? "Voice를 골라주세요"
      : null;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 lg:grid-cols-[22rem_1fr] lg:gap-10 lg:px-6">
      {/* Controls. Sticky on desktop so the result can scroll independently of the form. */}
      <aside className="scroll-subtle lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-2">
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

          <Field step={3} label="Voice 고르기">
            <div className="space-y-3">
              <VoicePicker
                voices={voices}
                selectedId={voiceId}
                onSelect={(next) => setVoiceId(next.id)}
              />
              <MyVoice
                initial={personalVoice}
                selectedId={voiceId}
                onSelect={(next) => setVoiceId(next.id)}
                signedIn={signedIn}
              />
            </div>
          </Field>

          <div className="sticky bottom-0 -mx-1 bg-background/95 px-1 pt-3 pb-1 backdrop-blur-sm">
            {signedIn ? (
              <Button
                size="lg"
                className="h-12 w-full text-base"
                disabled={Boolean(blocker) || submitting || Boolean(coverId)}
                onClick={startGeneration}
              >
                {submitting ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkle className="size-4" weight="fill" aria-hidden />
                )}
                {submitting ? "음원 올리는 중…" : "무료로 생성하기"}
              </Button>
            ) : (
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link href={`/login?next=${encodeURIComponent(voiceId ? `/?voice=${voiceId}` : "/")}`}>
                  로그인하고 만들기
                </Link>
              </Button>
            )}
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {blocker ?? `${voice?.name} · ${PREVIEW.durationSeconds}초 미리보기 · 무료`}
            </p>
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

      <div className="lg:border-l lg:border-border/60 lg:pl-10">
        <ResultPane
          state={paneState}
          onDone={(audioUrl, shareUrl) => {
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
                shareUrl,
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
