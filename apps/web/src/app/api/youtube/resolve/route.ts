import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { parseYouTubeUrl } from "@/lib/youtube";

/**
 * POST /api/youtube/resolve — fetches a link's audio so the user can hear it and pick a section
 * before generating.
 *
 * The download runs in the worker, never here. What comes back is an object in the private
 * `uploads` bucket plus a short-lived signed URL for the browser to play; the generation request
 * then reuses that object instead of fetching the video twice.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { url } = await request.json().catch(() => ({ url: "" }));
  const parsed = parseYouTubeUrl(String(url ?? ""));
  if (!parsed) {
    return NextResponse.json({ error: "YouTube 영상 주소를 확인해 주세요." }, { status: 400 });
  }

  const endpoint = process.env.WORKER_RESOLVE_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!endpoint || !secret) {
    return NextResponse.json({ error: "가져오기를 사용할 수 없습니다." }, { status: 503 });
  }

  let resolved: { path: string; durationSeconds: number };
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: parsed.url, userId: user.id, secret }),
      // Downloading and transcoding a full track takes a while; well under the function timeout.
      signal: AbortSignal.timeout(180_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: body.detail ?? "영상을 가져오지 못했어요." },
        { status: response.status === 422 ? 422 : 502 },
      );
    }
    resolved = body;
  } catch {
    return NextResponse.json({ error: "영상을 가져오지 못했어요. 다시 시도해 주세요." }, { status: 504 });
  }

  const { data: signed } = await supabase.storage
    .from("uploads")
    .createSignedUrl(resolved.path, 60 * 60);

  return NextResponse.json({
    path: resolved.path,
    durationSeconds: resolved.durationSeconds,
    audioUrl: signed?.signedUrl ?? null,
    canonicalUrl: parsed.url,
  });
}
