import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { MAX_PERSONAL_VOICES } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VOICE_FIELDS =
  "id, name, status, error_message, training_progress, training_stage, " +
  "f0_low, f0_median, f0_high, f0_peak, " +
  "f0_comfort_high, f0_absolute_high, f0_modal_high, f0_falsetto_high, " +
  "f0_train_high, train_count, created_at";

/** Deterministic id for one training run, shared by the charge and any later refund. */
export function trainingRunRef(voiceId: string, run: number): string {
  const hex = createHash("md5").update(`${voiceId}:${run}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Ids for an account's voices.
 *
 * The first one is bare, exactly as it was when an account could only have one — renaming it now
 * would orphan the checkpoint sitting in the Modal volume under that name. Every voice after it
 * takes a suffix.
 */
function voiceIdFor(userId: string, index: number): string {
  const base = `u-${userId.replace(/-/g, "").slice(0, 12)}`;
  return index === 0 ? base : `${base}-${index + 1}`;
}

/**
 * POST /api/voices/train — turns an uploaded recording into a personal voice.
 *
 * Send a voiceId to retrain that voice; omit it to add a new one.
 *
 * A voice is owned by its creator and never enters the catalogue: row level security only exposes
 * it back to them. That is the main guard against someone training a model on a voice that is not
 * theirs (PRD §4).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const {
    sourcePath,
    name,
    voiceId: requestedId,
    scalePath,
    comfortHz,
  } = await request.json().catch(() => ({}));
  if (typeof sourcePath !== "string" || !sourcePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "녹음을 먼저 올려주세요." }, { status: 400 });
  }
  // The scale take is optional: a voice trains without it, just with a range read off the song
  // instead of measured. Both fields are checked the same way as the recording — a path outside
  // the caller's own prefix is not theirs to point at.
  const scale =
    typeof scalePath === "string" && scalePath.startsWith(`${user.id}/`) ? scalePath : null;
  // The browser knew exactly which tone was sounding when the singer marked the limit, so this
  // arrives measured rather than guessed. Bound it to the range a human voice occupies so a
  // malformed number cannot poison the song matching.
  const comfort =
    typeof comfortHz === "number" && comfortHz >= 70 && comfortHz <= 1200
      ? Math.round(comfortHz * 100) / 100
      : null;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("voices")
    .select("id, status, train_count")
    .eq("owner_user_id", user.id)
    .order("created_at");
  const voices = existing ?? [];

  // A run already on a GPU is the one thing worth refusing. Anything else and a failed voice
  // would be permanently stuck, since its owner could never get past the check to try again.
  if (voices.some((row) => row.status === "queued" || row.status === "training")) {
    return NextResponse.json(
      { error: "이미 학습이 진행 중이에요. 끝나면 다시 만들 수 있어요." },
      { status: 409 },
    );
  }

  // Retraining names a voice we already own; anything else starts a new one.
  const retraining =
    typeof requestedId === "string" ? voices.find((row) => row.id === requestedId) : undefined;
  if (typeof requestedId === "string" && !retraining) {
    return NextResponse.json({ error: "없는 목소리입니다." }, { status: 404 });
  }

  if (!retraining && voices.length >= MAX_PERSONAL_VOICES) {
    return NextResponse.json(
      { error: `내 목소리는 계정당 ${MAX_PERSONAL_VOICES}개까지 만들 수 있어요.` },
      { status: 409 },
    );
  }

  const voiceId = retraining?.id ?? voiceIdFor(user.id, voices.length);
  const priorRuns = retraining?.train_count ?? 0;

  // One free training run per account, ever. After that every run costs a credit, whether it
  // makes a new voice or redoes an old one — the GPU does not care which it was.
  const runsSoFar = voices.reduce((total, row) => total + (row.train_count ?? 0), 0);
  // credit_transactions keys idempotency off reference_id, and a null reference never matches
  // itself — a retried refund would pay out twice. A uuid derived from the voice and the run
  // number gives the charge and its refund the same stable handle on both sides.
  const runRef = trainingRunRef(voiceId, priorRuns + 1);
  if (runsSoFar > 0) {
    const { error: spendError } = await admin.rpc("spend_credit", {
      p_user_id: user.id,
      p_cover_id: runRef,
    });
    if (spendError) {
      return NextResponse.json(
        { error: "크레딧이 부족해요. 목소리를 더 만들려면 크레딧이 필요합니다.", code: "no_credits" },
        { status: 402 },
      );
    }
  }

  const label =
    (typeof name === "string" && name.trim().slice(0, 20)) ||
    (voices.length === 0 ? "내 목소리" : `내 목소리 ${voices.length + 1}`);

  const { error } = await admin.from("voices").upsert({
    id: voiceId,
    name: label,
    description: "내가 녹음한 목소리",
    gender: "neutral",
    tags: ["내 목소리"],
    owner_user_id: user.id,
    training_audio_url: sourcePath,
    scale_audio_url: scale,
    f0_comfort_high: comfort,
    created_by_recording: true,
    status: "queued",
    is_active: false,
    sort_order: 0,
    train_count: priorRuns + 1,
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

/** GET — every voice this account owns, oldest first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ voices: [] });

  const { data } = await supabase
    .from("voices")
    .select(VOICE_FIELDS)
    .eq("owner_user_id", user.id)
    .order("created_at");

  return NextResponse.json({ voices: data ?? [] });
}
