"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleNotch, Microphone, Stop, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PRACTICE_SONGS } from "@/components/coverly/practice-songs";
import { createClient } from "@/lib/supabase/client";
import { CreditDialog } from "@/components/coverly/credit-dialog";
import { RangeGauge } from "@/components/coverly/range-gauge";
import { TARGET_SEMITONES, useVoiceMeter } from "@/components/coverly/use-voice-meter";
import { cn } from "@/lib/utils";

/**
 * A short sung recording, turned into a personal voice model.
 *
 * The prompt asks for the same phrase twice, low then high. Phase 0 measured why: a model only
 * learns the register the recording contains, so a 30-second take in one comfortable octave
 * produces a voice that falls apart everywhere else. Two keys doubles the range for the same
 * effort.
 */
const TARGET_SECONDS = 60;
const MIN_SECONDS = 30;

/** MediaRecorder speaks webm/opus on Chrome and Firefox, mp4/aac on Safari. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export function VoiceRecorder({
  voiceId,
  onTrainingStarted,
}: {
  /** The voice this recording replaces. Omit to add a new one. */
  voiceId?: string;
  onTrainingStarted: (id: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Refused for want of credits — offer the top-up right here rather than sending them hunting
  // through the account menu with a finished recording in hand.
  const [needCredits, setNeedCredits] = useState(false);

  const [songId, setSongId] = useState(PRACTICE_SONGS[0].id);
  const song = PRACTICE_SONGS.find((item) => item.id === songId) ?? PRACTICE_SONGS[0];

  const { meter, start: startMeter, stop: stopMeter, reset: resetMeter } = useVoiceMeter();
  const [span, setSpan] = useState(0);
  const [reach, setReach] = useState({ low: 0, high: 0 });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    stopMeter();
    setRecording(false);
  }, [stopMeter]);

  useEffect(() => () => stop(), [stop]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Noise suppression chews up singing; echo cancellation ducks sustained notes. Both are
        // tuned for speech on calls and actively hurt a vocal take.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType });
        setBlob(recorded);
        setPreviewUrl(URL.createObjectURL(recorded));
      };
      recorder.start();
      recorderRef.current = recorder;
      startMeter(stream);
      setBlob(null);
      setPreviewUrl(null);
      setSeconds(0);
      setSpan(0);
      setReach({ low: 0, high: 0 });
      resetMeter();
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((value) => {
          if (value + 1 >= TARGET_SECONDS + 20) stop();
          return value + 1;
        });
      }, 1000);
    } catch {
      toast.error("마이크를 사용할 수 없어요. 브라우저 권한을 확인해 주세요.");
    }
  }

  async function submit() {
    if (!blob) return;
    setSubmitting(true);
    try {
      // Storage validates the declared type against the bucket, so strip the codec parameter:
      // "audio/webm;codecs=opus" is not in the allow list, "audio/webm" is.
      const contentType = (blob.type || "audio/webm").split(";")[0];
      const file = new File([blob], "voice", { type: contentType });

      // Recordings go straight to storage like song uploads: a function request body cannot
      // carry them, and there is no reason for the audio to pass through the app.
      const signed = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType, size: file.size, purpose: "recording" }),
      });
      const info = await signed.json().catch(() => ({}));
      if (!signed.ok) {
        toast.error(info.error ?? "업로드를 준비하지 못했어요.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.storage
        .from("uploads")
        .uploadToSignedUrl(info.path, info.token, file, { contentType: file.type });
      if (error) {
        toast.error("녹음을 올리지 못했어요.");
        return;
      }

      const response = await fetch("/api/voices/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: info.path, ...(voiceId ? { voiceId } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "no_credits") setNeedCredits(true);
        toast.error(data.error ?? "학습을 시작하지 못했어요.");
        return;
      }
      onTrainingStarted(data.voiceId);
    } catch {
      toast.error("네트워크 오류로 학습을 시작하지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (recording && meter.semitones > span) {
      setSpan(meter.semitones);
      setReach({ low: meter.lowHz, high: meter.highHz });
    }
  }, [recording, meter.semitones, span, meter.lowHz, meter.highHz]);

  const enough = seconds >= MIN_SECONDS;
  const narrow = span > 0 && span < TARGET_SEMITONES * 0.6;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/50 p-4">
      <CreditDialog open={needCredits} onOpenChange={setNeedCredits} />
      <div>
        <p className="text-sm font-medium">{voiceId ? "다시 녹음하기" : "내 목소리로 만들기"}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          아래 곡의 <span className="text-foreground">1절만</span>, 한 번은 낮은 키로 한 번은 높은
          키로 불러주세요. 음역이 넓을수록 결과가 좋아져요.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="practice-song" className="sr-only">
          부를 노래
        </label>
        <select
          id="practice-song"
          value={songId}
          onChange={(event) => setSongId(event.target.value)}
          disabled={recording}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm disabled:opacity-50"
        >
          {PRACTICE_SONGS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.artist === "직접 고르기" ? item.title : `${item.title} — ${item.artist}`}
            </option>
          ))}
        </select>

        <p className="text-xs leading-relaxed text-muted-foreground">{song.hint}</p>

        {song.lyrics ? (
          <ol className="space-y-1 rounded-lg bg-secondary/60 px-3 py-2.5">
            {song.lyrics.map((line) => (
              <li key={line} className="text-sm">
                {line}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            가사는 아는 대로 부르시면 돼요. 저작권 때문에 가사를 여기에 싣지는 않습니다.
          </p>
        )}
      </div>

      {recording ? (
        <div className="space-y-2">
          <Progress value={Math.min(100, (seconds / TARGET_SECONDS) * 100)} />
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono tabular-nums text-muted-foreground">
              {String(Math.floor(seconds / 60)).padStart(2, "0")}:
              {String(seconds % 60).padStart(2, "0")}
            </span>
            <span className={cn(enough ? "text-primary" : "text-muted-foreground")}>
              {enough ? "충분해요" : `${MIN_SECONDS}초 이상 불러주세요`}
            </span>
          </div>

          {/* Input level: a take too quiet to analyse is rejected after upload, which is the
              worst moment to find out. */}
          <div className="h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-100",
                meter.level < 0.06 ? "bg-muted-foreground" : "bg-primary",
              )}
              style={{ width: `${Math.round(meter.level * 100)}%` }}
            />
          </div>
          <RangeGauge lowHz={reach.low} highHz={reach.high} currentHz={meter.lowHz > 0 ? meter.highHz : 0} />
          <p className="text-xs text-muted-foreground">
            {meter.level < 0.06
              ? "소리가 작아요. 마이크에 가까이서 불러주세요."
              : span < 1
                ? "천천히 한 소절 불러보세요."
                : `${span.toFixed(0)}반음 ${
                    span >= TARGET_SEMITONES
                      ? "· 충분해요"
                      : "· 더 높거나 낮은 키로도 불러주세요"
                  }`}
          </p>
          <Button variant="secondary" className="w-full" onClick={stop}>
            <Stop className="size-4" weight="fill" aria-hidden />
            녹음 끝내기
          </Button>
        </div>
      ) : previewUrl ? (
        <div className="space-y-2">
          {reach.high > 0 ? (
            <RangeGauge lowHz={reach.low} highHz={reach.high} className="pb-1" />
          ) : null}
          <audio src={previewUrl} controls className="w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setBlob(null);
                setPreviewUrl(null);
                setSeconds(0);
              }}
            >
              <X className="size-4" aria-hidden />
              다시 녹음
            </Button>
            <Button onClick={submit} disabled={submitting || seconds < MIN_SECONDS}>
              {submitting ? (
                <CircleNotch className="size-4 animate-spin" aria-hidden />
              ) : null}
              {submitting ? "올리는 중…" : "이 목소리로 만들기"}
            </Button>
          </div>
          {narrow && seconds >= MIN_SECONDS ? (
            <p className="text-xs text-muted-foreground">
              음역이 {span.toFixed(0)}반음으로 좁아요. 이대로도 만들 수 있지만, 낮은 키와 높은 키를
              한 번씩 부르면 훨씬 자연스러워져요.
            </p>
          ) : null}
          {seconds < MIN_SECONDS ? (
            <p className="text-xs text-destructive">
              {MIN_SECONDS}초 이상 필요해요. 다시 녹음해 주세요.
            </p>
          ) : null}
        </div>
      ) : (
        <Button className="w-full" onClick={start}>
          <Microphone className="size-4" weight="fill" aria-hidden />
          녹음 시작
        </Button>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        학습에 약 20분이 걸려요. 만든 목소리는 나만 보이고 다른 사람에게 공개되지 않습니다. 본인
        목소리만 녹음해 주세요.
      </p>
    </div>
  );
}
