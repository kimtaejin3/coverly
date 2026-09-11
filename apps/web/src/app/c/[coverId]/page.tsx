import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleNotch, Info } from "@phosphor-icons/react/dist/ssr";

import { AiNotice } from "@/components/coverly/ai-notice";
import { ResultPlayer } from "@/components/coverly/result-player";
import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";
import { VoiceAvatar } from "@/components/coverly/voice-avatar";
import type { Voice } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PREVIEW } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AI 커버",
  description: "Coverly로 만든 AI 커버입니다.",
};

interface CoverRow {
  id: string;
  voice_id: string;
  title: string;
  status: string;
  preview_duration_seconds: number | null;
  result_url: string | null;
}

export default async function CoverPage({ params }: PageProps<"/c/[coverId]">) {
  const { coverId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // One way in: the owner, through row level security. There is no shared link any more, and no
  // policy grants anonymous access to covers.
  let cover: CoverRow | null = null;
  if (user) {
    const { data } = await supabase
      .from("covers")
      .select("id, voice_id, title, status, preview_duration_seconds, result_url")
      .eq("id", coverId)
      .maybeSingle();
    cover = (data as CoverRow | null) ?? null;
  }

  if (!cover) {
    // A signed-out visitor might be the owner following their own link, so offer the login.
    if (!user) redirect(`/login?next=${encodeURIComponent(`/c/${coverId}`)}`);
    notFound();
  }

  // Only personal voices exist, and the owner is the only reader, so name it plainly.
  const voice: Voice = {
    id: cover.voice_id,
    name: "내 목소리",
    description: "내가 녹음한 목소리",
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

  let audioUrl: string | null = null;
  if (cover.result_url) {
    const { data } = await createAdminClient()
      .storage.from("covers")
      .createSignedUrl(cover.result_url, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

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
            />
          </div>

          <Alert className="mt-4">
            <Info className="size-4" aria-hidden />
            <AlertDescription className="leading-relaxed">
              이 커버는 만든 사람만 들을 수 있습니다. 파일로 내려받거나 외부에 공유할 수는
              없습니다.
            </AlertDescription>
          </Alert>

        </div>
      </main>
      <SiteFooter />
    </>
  );
}
