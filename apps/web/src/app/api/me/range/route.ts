import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in person's vocal range.
 *
 * Kept on the user rather than on a voice: it is a fact about a throat, and it does not change
 * when they train a second model. `voices.f0_train_high` stays where it is, because that one is a
 * fact about a checkpoint.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { comfortHz, modalHz, falsettoHz } = await request.json().catch(() => ({}));
  const hz = (value: unknown) =>
    typeof value === "number" && value >= 70 && value <= 1200
      ? Math.round(value * 100) / 100
      : null;

  const modal = hz(modalHz);
  if (modal === null) {
    return NextResponse.json({ error: "측정값이 올바르지 않아요." }, { status: 400 });
  }

  // Written through a security definer function so the row is keyed off auth.uid() rather than
  // anything the caller sends.
  const { error } = await supabase.rpc("save_vocal_range", {
    p_comfort: hz(comfortHz) ?? modal,
    p_modal: modal,
    p_falsetto: hz(falsettoHz),
  });
  if (error) {
    return NextResponse.json({ error: "음역대를 저장하지 못했어요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
