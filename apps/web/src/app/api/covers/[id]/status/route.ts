import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/covers/:id/status — polled every few seconds while a generation runs (PRD §38).
 * Row level security does the authorisation: a cover belonging to someone else simply is not found.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/covers/[id]/status">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: cover } = await supabase
    .from("covers")
    .select("id, status, result_url, voice_id, title, completed_at")
    .eq("id", id)
    .maybeSingle();

  if (!cover) {
    return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  }

  const { data: job } = await supabase
    .from("generation_jobs")
    .select("status, queue_position, error_message")
    .eq("cover_id", id)
    .maybeSingle();

  // Sign the finished audio here so the workspace can play and download without a page change.
  let audioUrl: string | null = null;
  if (cover.status === "completed" && cover.result_url) {
    const { data } = await supabase.storage.from("covers").createSignedUrl(cover.result_url, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

  return NextResponse.json({
    coverId: cover.id,
    status: cover.status,
    audioUrl,
    // Handed back so the workspace can offer a link that works for people without an account.
    queuePosition: job?.queue_position ?? null,
    errorMessage: job?.error_message ?? null,
    voiceId: cover.voice_id,
    title: cover.title,
  });
}
