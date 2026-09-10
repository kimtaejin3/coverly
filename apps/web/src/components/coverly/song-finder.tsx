"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretDown, MusicNotes } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { noteName, semitonesBetween } from "@/lib/pitch";
import { cn } from "@/lib/utils";

const GENRES = ["전체", "발라드", "모던록", "록", "팝"] as const;

/**
 * Songs ranked by how little transposing they need to reach the owner's voice.
 *
 * "Fits my range" is the wrong question here, because the pipeline transposes every song into
 * range anyway. What actually varies is how far it has to move: rubberband smears an instrumental
 * the further it is stretched, and the model sounds most like itself near the register it was
 * trained on. So the ranking is by distance from the singer's median, not by whether they can
 * reach the original key.
 */
export function SongFinder({ voicePeak }: { voicePeak: number | null }) {
  const [songs, setSongs] = useState<SongRange[] | null>(null);
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("전체");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || songs) return;
    fetch("/api/songs")
      .then((r) => r.json())
      .then((d) => setSongs(d.songs ?? []))
      .catch(() => setSongs([]));
  }, [open, songs]);

  // One shape either way, so the list does not have to know whether a voice exists yet.
  const ranked = useMemo((): { song: SongRange; shift: number | null }[] => {
    if (!songs) return [];
    const filtered = genre === "전체" ? songs : songs.filter((s) => s.genre === genre);
    // Peak against peak. Comparing a song's highest note to a singer's *comfortable* ceiling is
    // what made 공허해 read as two semitones away while its actual high notes were out of reach.
    const scored = filtered.map((song) => ({
      song,
      shift: voicePeak && song.f0_peak ? semitonesBetween(song.f0_peak, voicePeak) : null,
    }));
    if (!voicePeak) return scored;
    return [...scored].sort((a, b) => Math.abs(a.shift ?? 99) - Math.abs(b.shift ?? 99));
  }, [songs, genre, voicePeak]);

  return (
    <div className="rounded-xl border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <MusicNotes className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm font-medium">내 음역대 노래 찾기</span>
        <CaretDown
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-2.5 border-t border-border/60 px-3 py-3">
          {voicePeak ? (
            <p className="text-xs text-muted-foreground">
              내가 낸 가장 높은 음{" "}
              <span className="font-medium text-foreground">{noteName(voicePeak)}</span> 과(와) 곡의
              최고음을 견줘, 키를 적게 옮겨도 되는 순서예요.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              내 목소리를 만들면 나에게 맞는 순서로 정렬돼요.
            </p>
          )}

          <div className="flex flex-wrap gap-1">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  genre === g
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {songs === null ? (
            <p className="py-2 text-xs text-muted-foreground">불러오는 중…</p>
          ) : (
            <ul className="scroll-subtle max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {ranked.map(({ song, shift }) => (
                <li
                  key={`${song.artist}-${song.title}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{song.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {song.artist}
                      {song.top_note ? ` · 최고음 ${song.top_note}` : ""}
                      {song.f0_peak ? "" : " · 최고음 미확인"}
                    </span>
                  </span>
                  {shift !== null ? (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs tabular-nums",
                        Math.abs(shift) <= 3 ? "text-primary" : "text-muted-foreground",
                      )}
                      title="이만큼 키를 옮겨서 만들어요"
                    >
                      {shift > 0 ? "+" : ""}
                      {Math.round(shift)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            숫자는 옮길 반음 수예요. 어떤 곡이든 자동으로 맞춰 주지만, 적게 옮길수록 목소리가
            자연스럽습니다. &lsquo;음역 미확인&rsquo;은 아직 최고음을 모르는 곡이라 순서에서
            뒤로 갑니다 &mdash; 누군가 그 곡으로 커버를 만들면 실측이 채워집니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
