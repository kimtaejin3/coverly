import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CircleNotch, Info } from "@phosphor-icons/react/dist/ssr";

import { AiNotice } from "@/components/coverly/ai-notice";
import { ResultPlayer } from "@/components/coverly/result-player";
import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";
import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import type { Voice } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PREVIEW, PRICING } from "@/lib/config";
import { formatKrw } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { listVoices } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AI 커버",
  description: "Coverly로 만든 AI 커버입니다.",
};

interface CoverRow {
  id: string;
  voice_id: string;
  share_expires_at: string;
  title: string;
  status: string;
  preview_duration_seconds: number | null;
  result_url: string | null;
  share_token: string;
}

export default async function CoverPage({ params, searchParams }: PageProps<"/c/[coverId]">) {
  const { coverId } = await params;
  const query = await searchParams;
  const token = typeof query.t === "string" ? query.t : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Two ways in. The owner reads their own row through row level security; a link holder reads
  // one specific row by id *and* token, which is why that lookup uses the service key — no policy
  // grants anonymous access to covers, and none should.
  let cover: CoverRow | null = null;
  let isOwner = false;

  if (user) {
    const { data } = await supabase
      .from("covers")
      .select("id, voice_id, title, status, preview_duration_seconds, result_url, share_token, share_expires_at")
      .eq("id", coverId)
      .maybeSingle();
    if (data) {
      cover = data as CoverRow;
      isOwner = true;
    }
  }

  let expired = false;
  if (!cover && token) {
    const { data } = await createAdminClient()
      .from("covers")
      .select("id, voice_id, title, status, preview_duration_seconds, result_url, share_token, share_expires_at")
      .eq("id", coverId)
      .eq("share_token", token)
      .maybeSingle();
    const row = (data as CoverRow | null) ?? null;
    if (row && new Date(row.share_expires_at) < new Date()) {
      expired = true;
    } else {
      cover = row;
    }
  }

  if (expired) {
    return (
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">링크가 만료되었어요</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            공유 링크는 만든 날로부터 30일 동안만 열립니다. 만든 사람에게 새 링크를 요청해
            주세요.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">직접 만들어보기</Link>
          </Button>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!cover) {
    // Without a token there is nothing to show a stranger, and asking them to sign in would not
    // help — the cover is not theirs. Only send signed-out visitors to login when no token was
    // supplied at all, in case they are the owner following a bare link.
    if (!user && !token) redirect(`/login?next=${encodeURIComponent(`/c/${coverId}`)}`);
    notFound();
  }

  const voices = await listVoices();
  const catalogueVoice = voices.find((item) => item.id === cover.voice_id) ?? null;

  // A cover made with a personal voice has no catalogue entry, and falling back to the first
  // voice would credit the cover to Aria. Nobody else can use that voice either, so it is named
  // without identifying its owner.
  const voice: Voice = catalogueVoice ?? {
    id: cover.voice_id,
    name: "직접 만든 목소리",
    description: "만든 사람이 직접 녹음한 목소리예요.",
    gender: "female",
    tags: [],
    sampleUrl: "",
    sampleTitle: "",
    rangeLabel: "",
    accent: "",
    sourceCredit: null,
    sourceLicense: null,
    isActive: true,
  };
  const others = voices.filter((item) => item.id !== voice.id).slice(0, 3);

  let audioUrl: string | null = null;
  if (cover.result_url) {
    // Signed by the service key so a link holder can play without an account; the URL is still
    // short-lived and specific to this one object.
    const { data } = await createAdminClient()
      .storage.from("covers")
      .createSignedUrl(cover.result_url, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

  const shareUrl = `/c/${cover.id}?t=${cover.share_token}`;

  return (
    <>
      <SiteHeader />
      <main id="main" className="aurora w-full flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-2xl px-4 py-8">
          <AiNotice />

          {cover.status !== "completed" ? (
            <Alert className="mt-4">
              <CircleNotch className="size-4 animate-spin" aria-hidden />
              <AlertDescription>
                {cover.status === "failed"
                  ? "생성에 실패했어요."
                  : "아직 만들고 있어요. 잠시 후 새로고침해 주세요."}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-4">
            <ResultPlayer
              voice={voice}
              title={cover.title || "AI 커버"}
              durationSeconds={cover.preview_duration_seconds ?? PREVIEW.durationSeconds}
              audioUrl={audioUrl}
              shareUrl={shareUrl}
              showActions={isOwner}
            />
          </div>

          {isOwner ? (
            <Card className="mt-4 gap-3 border-primary/30 bg-primary/5 p-5">
              <div>
                <h2 className="font-semibold">전체 곡으로 만들기</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  지금은 {PREVIEW.durationSeconds}초 미리보기예요. 곡 전체를 같은 Voice로 완성할 수
                  있습니다.
                </p>
              </div>
              <Button size="lg" className="h-12 w-full text-base" disabled>
                전체 곡 만들기 · {formatKrw(PRICING.fullCoverKrw)}
              </Button>
              <p className="text-center text-xs text-muted-foreground">결제 기능은 준비 중입니다</p>
            </Card>
          ) : (
            <Card className="mt-4 gap-3 p-5">
              <div>
                <h2 className="font-semibold">나도 만들어보기</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  가지고 있는 음원을 올리면 {PREVIEW.durationSeconds}초 AI 커버를 무료로 만들 수
                  있어요.
                </p>
              </div>
              <Button asChild size="lg" className="h-12 w-full text-base">
                <Link href="/">
                  내 음원으로 만들어보기
                  <ArrowRight className="size-4" weight="bold" aria-hidden />
                </Link>
              </Button>
            </Card>
          )}

          <Alert className="mt-4">
            <Info className="size-4" aria-hidden />
            <AlertDescription className="leading-relaxed">
              {isOwner
                ? `링크를 아는 사람은 로그인 없이 이 커버를 들을 수 있고, 링크는 ${new Date(
                    cover.share_expires_at,
                  ).toLocaleDateString("ko-KR")}까지 열립니다. 원곡의 권리 관계를 확인한 뒤 공유해 주세요.`
                : "이 음원은 AI로 생성된 커버입니다. 원곡의 권리는 원저작자에게 있습니다."}
            </AlertDescription>
          </Alert>

          {isOwner ? (
            <section className="mt-10">
              <h2 className="font-semibold">다른 Voice로도 만들어보기</h2>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground">
                  준비 중
                </span>
                샘플 Voice는 2026년 10월 중 출시 예정이에요.
              </p>
              <div className="mt-3 cursor-not-allowed opacity-45" aria-disabled="true">
                <div className="pointer-events-none grid gap-2" inert>
                  {others.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <VoiceAvatar
                        voiceId={item.id}
                        name={item.name}
                        className="size-10 rounded-xl"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{item.name}</span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
