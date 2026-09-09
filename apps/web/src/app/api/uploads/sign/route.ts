import { NextResponse, type NextRequest } from "next/server";

import { UPLOAD } from "@/lib/config";

const RECORDING_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"] as const;

const EXTENSIONS: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/uploads/sign — hands the browser a one-shot upload URL for Supabase Storage.
 *
 * The audio never passes through this app. Vercel caps a function's request body at 4.5 MB, well
 * under the 50 MB the product advertises, so posting the file to our own API failed on almost
 * every real song. Uploading straight to storage removes that ceiling and the extra hop.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { contentType, size, purpose } = await request.json().catch(() => ({}));

  // A song comes from the user's disk in a handful of known formats; a recording comes from
  // MediaRecorder, which produces webm/opus on Chrome and Firefox and mp4/aac on Safari.
  const accepted: readonly string[] =
    purpose === "recording" ? RECORDING_TYPES : UPLOAD.acceptedTypes;
  if (typeof contentType !== "string" || !accepted.includes(contentType)) {
    return NextResponse.json(
      {
        error:
          purpose === "recording"
            ? "이 브라우저의 녹음 형식을 지원하지 않아요."
            : "MP3, WAV, M4A 파일만 올릴 수 있습니다.",
      },
      { status: 415 },
    );
  }
  if (typeof size !== "number" || size <= 0 || size > UPLOAD.maxBytes) {
    return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 });
  }

  const extension = EXTENSIONS[contentType] ?? "mp3";
  // The path is inside the caller's own folder, which is also what the storage policy enforces.
  const path = `${user.id}/up-${crypto.randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage.from("uploads").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "업로드를 준비하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ path, token: data.token });
}
