import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** One personal voice per account: training is ~20 GPU-minutes and a 750 MB checkpoint each. */
const MAX_PERSONAL_VOICES = 1;

/**
 * POST /api/voices/train — turns an uploaded recording into a personal voice.
 *
 * The voice is owned by its creator and never enters the catalogue: row level security only
 * exposes it back to them. That is the main guard against someone training a model on a voice
 * that is not theirs (PRD §4).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { sourcePath, name } = await request.json().catch(() => ({}));
  if (typeof sourcePath !== "string" || !sourcePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "녹음을 먼저 올려주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const voiceId = `u-${user.id.replace(/-/g, "").slice(0, 12)}`;

  const { data: existing } = await admin
    .from("voices")
    .select("id, status")
    .eq("owner_user_id", user.id);

  // The id is derived from the account, so re-recording overwrites the same row rather than
  // adding one. Only a run already on a GPU is worth refusing -- otherwise a failed voice would
  // be permanently stuck, since its owner could never get past the quota to try again.
  if ((existing ?? []).some((row) => row.status === "queued" || row.status === "training")) {
    return NextResponse.json(
      { error: "이미 학습이 진행 중이에요. 끝나면 다시 만들 수 있어요." },
      { status: 409 },
    );
  }
  if ((existing ?? []).filter((row) => row.id !== voiceId).length >= MAX_PERSONAL_VOICES) {
    return NextResponse.json(
      { error: `내 목소리는 계정당 ${MAX_PERSONAL_VOICES}개까지 만들 수 있어요.` },
      { status: 409 },
    );
  }
  const label = (typeof name === "string" && name.trim().slice(0, 20)) || "내 목소리";

  const { error } = await admin.from("voices").upsert({
    id: voiceId,
    name: label,
    description: "내가 녹음한 목소리",
    gender: "neutral",
    tags: ["내 목소리"],
    owner_user_id: user.id,
    training_audio_url: sourcePath,
    created_by_recording: true,
    status: "queued",
    is_active: false,
    sort_order: 0,
  });
  if (error) {
    return NextResponse.json({ error: "보이스를 만들지 못했습니다." }, { status: 500 });
  }

  const endpoint = process.env.WORKER_TRAIN_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (endpoint && secret) {
    // Fire and forget: training takes ~20 minutes, and the page polls for the result.
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, secret }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }

  return NextResponse.json({ voiceId }, { status: 202 });
}

/** GET — the owner's personal voice and where its training got to. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ voice: null });

  const { data } = await supabase
    .from("voices")
    .select("id, name, status, error_message, training_progress, training_stage, f0_low, f0_median, f0_high, f0_peak")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ voice: data ?? null });
}
