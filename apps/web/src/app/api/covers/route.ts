import { NextResponse, type NextRequest } from "next/server";

import { FREE_GENERATIONS_PER_ACCOUNT, PREVIEW } from "@/lib/config";
import { parseYouTubeUrl } from "@/lib/youtube";
import { clientIpFrom, ipHasCapacity } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notifyWorker } from "@/lib/worker";

/**
 * POST /api/covers — accepts the upload, records the job, and returns immediately (PRD §38).
 * The GPU worker picks the queued job up; nothing here waits on inference.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const form = await request.formData();
  const youtubeInput = String(form.get("youtubeUrl") ?? "").trim();
  // Set when the browser already fetched the audio for preview; reusing it avoids a second
  // download and means the section the user auditioned is the one that gets converted.
  const sourcePath = String(form.get("sourcePath") ?? "").trim();
  const voiceId = String(form.get("voiceId") ?? "");
  const startSeconds = Number(form.get("startSeconds") ?? PREVIEW.defaultStartSeconds);
  const title = String(form.get("title") ?? "").slice(0, 120);

  // Exactly one source. A YouTube link is resolved by the worker, never here: the web tier
  // records the URL and stays out of the retrieval path.
  const youtube = youtubeInput ? parseYouTubeUrl(youtubeInput) : null;
  if (youtubeInput && !youtube) {
    return NextResponse.json({ error: "YouTube 영상 주소를 확인해 주세요." }, { status: 400 });
  }
  if (!sourcePath) {
    return NextResponse.json({ error: "음원을 먼저 올려주세요." }, { status: 400 });
  }

  if (!voiceId) {
    return NextResponse.json({ error: "Voice를 선택해 주세요." }, { status: 400 });
  }
  // A resolved object path is user input like any other: it must sit in the caller's own folder.
  if (sourcePath && !sourcePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: voice } = await admin
    .from("voices")
    .select("id, owner_user_id")
    .eq("id", voiceId)
    .eq("is_active", true)
    .maybeSingle();
  // This runs on the admin client, which bypasses RLS, so ownership is checked here: a personal
  // voice belongs to exactly one account and nobody else may sing with it.
  if (!voice || (voice.owner_user_id !== null && voice.owner_user_id !== user.id)) {
    return NextResponse.json({ error: "사용할 수 없는 Voice입니다." }, { status: 400 });
  }

  const { data: profile } = await admin
    .from("users")
    .select("credit_balance, free_generations_used, free_generation_limit")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 400 });
  }

  // Free previews first, then credits. Paid full covers come in Phase 5.
  const used = profile.free_generations_used ?? 0;
  // A per-account override exists so one tester can be given more without moving the limit for
  // everyone; null means the app-wide default applies.
  const limit = profile.free_generation_limit ?? FREE_GENERATIONS_PER_ACCOUNT;
  if (used >= limit) {
    return NextResponse.json(
      { error: `무료 생성은 계정당 ${limit}회입니다. 전체 곡 생성은 곧 제공됩니다.` },
      { status: 402 },
    );
  }

  const ip = clientIpFrom(request.headers);
  if (!(await ipHasCapacity(ip))) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  const { data: cover, error: coverError } = await admin
    .from("covers")
    .insert({
      user_id: user.id,
      voice_id: voiceId,
      title: title || (youtube ? "YouTube 음원" : "내 커버"),
      preview_start_seconds: Math.max(0, Math.round(startSeconds)),
      preview_duration_seconds: PREVIEW.durationSeconds,
      type: "preview",
      status: "queued",
      source_type: youtube ? "youtube" : "upload",
      source_url: youtube?.url ?? null,
      original_file_url: sourcePath,
      client_ip: ip,
    })
    .select("id")
    .single();

  if (coverError || !cover) {
    return NextResponse.json({ error: "생성을 시작하지 못했습니다." }, { status: 500 });
  }

  await admin.from("generation_jobs").insert({ cover_id: cover.id, status: "queued" });
  await admin
    .from("users")
    .update({ free_generations_used: used + 1, free_generation_used: used + 1 >= limit })
    .eq("id", user.id);

  await notifyWorker(cover.id);

  return NextResponse.json({ coverId: cover.id }, { status: 202 });
}
