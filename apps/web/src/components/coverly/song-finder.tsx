"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretDown, MusicNotes } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { noteName, semitonesBetween } from "@/lib/pitch";
import { cn } from "@/lib/utils";

const GENRES = ["전체", "발라드", "모던록", "록", "팝"] as const;

/**
 * Which songs this voice can actually sing, and how.
 *
 * The question was never "does it fit" — the cover pipeline transposes anything into range. It is
 * what a singer standing in a 노래방 needs: can I hold this, or do I have to squeeze for the
 * chorus, or should I just drop the key.
 *
 * Answering that takes two ceilings, not one. Against a single number the middle case disappears,
 * and the middle case is most of the interesting songs: 공허해 came back as two semitones away,
 * which was true of the average note and wrong about the ones that matter.
 */
type Tier = "comfort" | "strain" | "transpose" | "unknown";

const TIER_ORDER: Record<Tier, number> = { comfort: 0, strain: 1, transpose: 2, unknown: 3 };

interface Ranked {
  song: SongRange;
  tier: Tier;
  /** Semitones to drop before it sits in the comfortable range. Only set for `transpose`. */
  shift: number | null;
}

function classify(song: SongRange, comfortHigh: number | null, absoluteHigh: number | null): Ranked {
  if (!song.f0_peak || !absoluteHigh) return { song, tier: "unknown", shift: null };
  if (comfortHigh && song.f0_peak <= comfortHigh) return { song, tier: "comfort", shift: null };
  if (song.f0_peak <= absoluteHigh) return { song, tier: "strain", shift: null };
  // Target the comfortable ceiling, not the absolute one: a key you can only just reach is not a
  // key you want to be handed in front of other people.
  return { song, tier: "transpose", shift: semitonesBetween(song.f0_peak, comfortHigh || absoluteHigh) };
}

export function SongFinder({
  comfortHigh,
  absoluteHigh,
}: {
  comfortHigh: number | null;
  absoluteHigh: number | null;
}) {
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

  const ranked = useMemo((): Ranked[] => {
    if (!songs) return [];
    const filtered = genre === "전체" ? songs : songs.filter((s) => s.genre === genre);
    const scored = filtered.map((song) => classify(song, comfortHigh, absoluteHigh));
    if (!absoluteHigh) return scored;
    return [...scored].sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        Math.abs(a.shift ?? 0) - Math.abs(b.shift ?? 0),
    );
  }, [songs, genre, comfortHigh, absoluteHigh]);

  const counts = useMemo(() => {
    const out = { comfort: 0, strain: 0 };
    for (const item of ranked) {
      if (item.tier === "comfort") out.comfort += 1;
      if (item.tier === "strain") out.strain += 1;
    }
    return out;
  }, [ranked]);

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
          {absoluteHigh ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {comfortHigh ? (
                <>
                  편한 한계{" "}
                  <span className="font-medium text-foreground">{noteName(comfortHigh)}</span>
                  {" · "}최고{" "}
                  <span className="font-medium text-foreground">{noteName(absoluteHigh)}</span>
                  {" 기준이에요. "}
                  {counts.comfort > 0 ? `편하게 부를 수 있는 곡이 ${counts.comfort}곡` : null}
                  {counts.comfort > 0 && counts.strain > 0 ? ", " : null}
                  {counts.strain > 0 ? `힘주면 되는 곡이 ${counts.strain}곡` : null}
                  {counts.comfort > 0 || counts.strain > 0 ? " 있어요." : null}
                </>
              ) : (
                <>
                  내가 낸 가장 높은 음{" "}
                  <span className="font-medium text-foreground">{noteName(absoluteHigh)}</span> 기준
                  이에요. 음역대를 재면 편하게 부를 수 있는 곡까지 갈라서 보여드려요.
                </>
              )}
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
              {ranked.map(({ song, tier, shift }) => (
                <li
                  key={`${song.artist}-${song.title}`}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{song.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {song.artist}
                      {song.top_note ? ` · 최고음 ${song.top_note}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs whitespace-nowrap",
                      tier === "comfort" && "font-medium text-primary",
                      tier === "strain" && "text-amber-600 dark:text-amber-500",
                      tier === "transpose" && "font-mono tabular-nums text-muted-foreground",
                      tier === "unknown" && "text-muted-foreground/70",
                    )}
                    title={
                      tier === "comfort"
                        ? "편한 음역 안에 들어와요"
                        : tier === "strain"
                          ? "낼 수는 있지만 고음에서 힘을 써야 해요"
                          : tier === "transpose"
                            ? "이만큼 키를 내리면 편하게 불러요"
                            : "아직 최고음을 모르는 곡이에요"
                    }
                  >
                    {tier === "comfort"
                      ? "편하게"
                      : tier === "strain"
                        ? "고음 힘줘야"
                        : tier === "transpose"
                          ? `${Math.round(shift ?? 0)}키`
                          : "미확인"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            노래방에서 부를 때 기준이에요. <span className="text-foreground">고음 힘줘야</span>는
            낼 수는 있지만 후렴에서 무리가 가는 곡, 숫자는 내려야 하는 키 수입니다. AI 커버는 어떤
            곡이든 자동으로 맞춰 주지만, 적게 옮길수록 목소리가 자연스러워요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
