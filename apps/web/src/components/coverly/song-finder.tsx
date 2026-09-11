"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretDown, MusicNotes } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { noteName } from "@/lib/pitch";
import { classifyFit, TIER_HINT, TIER_ORDER, type Tier } from "@/lib/range";
import { cn } from "@/lib/utils";

const GENRES = ["전체", "발라드", "모던록", "록", "팝"] as const;

/**
 * Which songs this voice can actually sing, and how.
 *
 * The question was never "does it fit" -- the cover pipeline transposes anything into range. It is
 * what a singer standing in a 노래방 needs: can I hold this, or do I have to squeeze for the
 * chorus, or should I just drop the key. The three-way answer lives in `lib/range`, shared with
 * the practice-song picker so the two never disagree.
 */
interface Ranked {
  song: SongRange;
  tier: Tier;
  shift: number | null;
}

export function SongFinder({
  comfortHigh,
  modalHigh,
  falsettoHigh,
}: {
  comfortHigh: number | null;
  /** 진성 ceiling. Matching compares to this because song 최고음 is 진성 in 77 of 78 rows. */
  modalHigh: number | null;
  /** 가성 ceiling. Shown as a footnote -- taking a chorus in falsetto is a real thing people do. */
  falsettoHigh: number | null;
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
    const scored = filtered.map((song) => ({
      song,
      ...classifyFit(song.f0_peak, comfortHigh, modalHigh),
    }));
    if (!modalHigh) return scored;
    return [...scored].sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        Math.abs(a.shift ?? 0) - Math.abs(b.shift ?? 0),
    );
  }, [songs, genre, comfortHigh, modalHigh]);

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
          {modalHigh ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {comfortHigh ? (
                <>
                  편한 한계{" "}
                  <span className="font-medium text-foreground">{noteName(comfortHigh)}</span>
                  {" · "}진성 최고{" "}
                  <span className="font-medium text-foreground">{noteName(modalHigh)}</span>
                  {" 기준이에요. "}
                  {counts.comfort > 0 ? `편하게 부를 수 있는 곡이 ${counts.comfort}곡` : null}
                  {counts.comfort > 0 && counts.strain > 0 ? ", " : null}
                  {counts.strain > 0 ? `힘주면 되는 곡이 ${counts.strain}곡` : null}
                  {counts.comfort > 0 || counts.strain > 0 ? " 있어요." : null}
                </>
              ) : (
                <>
                  내가 낸 가장 높은 음{" "}
                  <span className="font-medium text-foreground">{noteName(modalHigh)}</span> 기준
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
                      tier === "strain" && shift
                        ? `${TIER_HINT.strain} · ${shift}키 내리면 편해요`
                        : TIER_HINT[tier]
                    }
                  >
                    {tier === "comfort"
                      ? "편하게"
                      : tier === "strain"
                        ? "힘줘야"
                        : tier === "transpose"
                          ? `${shift}키`
                          : "미확인"}
                    {/* The key that makes it easy, for the tier where the warning alone would
                        leave someone stuck with their own throat as the answer. */}
                    {tier === "strain" && shift ? (
                      <span className="ml-1 font-mono tabular-nums text-muted-foreground">
                        {shift}키
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {falsettoHigh ? (
            <p className="rounded-lg bg-secondary/50 px-2.5 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
              가성으로는 <span className="font-medium text-foreground">{noteName(falsettoHigh)}</span>
              까지 올라가요. 위 순서는 진성 기준이라, 후렴만 가성으로 넘기면 더 높은 곡도
              부를 수 있습니다.
            </p>
          ) : null}

          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            노래방에서 부를 때 기준이에요. <span className="text-amber-600 dark:text-amber-500">
            힘줘야</span>는 낼 수는 있지만 후렴에서 무리가 가는 곡이고, 옆의 숫자만큼 키를 내리면
            편해집니다. AI 커버는 어떤 곡이든 자동으로 맞춰 주지만, 적게 옮길수록 목소리가
            자연스러워요.
          </p>
        </div>
      ) : null}
    </div>
  );
}
