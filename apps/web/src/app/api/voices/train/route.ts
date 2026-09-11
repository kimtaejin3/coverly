import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** One personal voice per account: training is ~20 GPU-minutes and a 750 MB checkpoint each. */
const MAX_PERSONAL_VOICES = 1;

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
    .select("id, status, train_count")
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

  // The first training is free; every re-record after that costs a credit. Charged here rather
  // than in the worker so the person is told before they wait twenty minutes, and refunded by
  // the worker if the run fails.
  const priorRuns = existing?.find((row) => row.id === voiceId)?.train_count ?? 0;
  // credit_transactions keys idempotency off reference_id, and a null reference never matches
  // itself — a retried refund would pay out twice. A uuid derived from the voice and the run
  // number gives the charge and its refund the same stable handle on both sides.
  const runRef = trainingRunRef(voiceId, priorRuns + 1);
  if (priorRuns > 0) {
    const { error: spendError } = await admin.rpc("spend_credit", {
      p_user_id: user.id,
      p_cover_id: runRef,
    });
    if (spendError) {
      return NextResponse.json(
        { error: "크레딧이 부족해요. 다시 만들려면 크레딧이 필요합니다.", code: "no_credits" },
        { status: 402 },
      );
    }
  }

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
