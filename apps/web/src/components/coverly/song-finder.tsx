"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretRight, MusicNotes } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { noteName } from "@/lib/pitch";
import { classifyFit, TIER_HINT, TIER_ORDER, type Tier } from "@/lib/range";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
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
    // Fetched up front now, not on open: the trigger row shows a count, so the number has to be
    // there before anyone taps it.
    if (songs) return;
    fetch("/api/songs")
      .then((r) => r.json())
      .then((d) => setSongs(d.songs ?? []))
      .catch(() => setSongs([]));
  }, [songs]);

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
    <>
      {/* A row, not an accordion. Expanding a hundred songs inside a 340px column pushed the
          button that actually makes a cover off the bottom of the screen. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
      >
        <MusicNotes className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">내 음역대 노래 찾기</span>
          <span className="block truncate text-xs text-muted-foreground">
            {modalHigh
              ? `진성 ${noteName(modalHigh)} 기준${
                  counts.comfort > 0 ? ` · 편하게 ${counts.comfort}곡` : ""
                }`
              : "내 목소리를 만들면 나에게 맞춰 정렬돼요"}
          </span>
        </span>
        <CaretRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="내 음역대 노래 찾기"
        description={
          modalHigh
            ? "노래방에서 부를 때 기준이에요. 숫자만큼 키를 내리면 편해집니다."
            : "내 목소리를 만들면 나에게 맞는 순서로 정렬돼요."
        }
      >
        <div className="space-y-3 pb-1">
          {modalHigh ? (
            <p className="rounded-lg bg-primary/8 px-3 py-2 text-xs leading-relaxed">
              편한 한계{" "}
              <span className="font-medium">{noteName(comfortHigh ?? modalHigh)}</span>
              {" · "}진성 최고 <span className="font-medium">{noteName(modalHigh)}</span>
              {counts.comfort > 0 || counts.strain > 0 ? (
                <span className="text-muted-foreground">
                  {" — "}
                  {counts.comfort > 0 ? `편하게 ${counts.comfort}곡` : ""}
                  {counts.comfort > 0 && counts.strain > 0 ? ", " : ""}
                  {counts.strain > 0 ? `힘주면 ${counts.strain}곡` : ""}
                </span>
              ) : null}
            </p>
          ) : null}

          {/* Sticky so the filter stays reachable after scrolling into the hundreds. */}
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 bg-popover px-1 pb-1">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition-colors",
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
            <p className="py-6 text-center text-xs text-muted-foreground">불러오는 중…</p>
          ) : (
            <ul className="space-y-0.5">
              {ranked.map(({ song, tier, shift }) => (
                <li
                  key={`${song.artist}-${song.title}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 odd:bg-secondary/30"
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
                      "shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap",
                      tier === "comfort" && "bg-primary/12 font-medium text-primary",
                      tier === "strain" &&
                        "bg-amber-500/12 text-amber-700 dark:text-amber-500",
                      tier === "transpose" && "font-mono tabular-nums text-muted-foreground",
                      tier === "unknown" && "text-muted-foreground/60",
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
                        ? `힘줘야${shift ? ` ${shift}키` : ""}`
                        : tier === "transpose"
                          ? `${shift}키`
                          : "미확인"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {falsettoHigh ? (
            <p className="rounded-lg bg-secondary/50 px-3 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
              가성으로는 <span className="font-medium text-foreground">{noteName(falsettoHigh)}</span>
              까지 올라가요. 위 순서는 진성 기준이라, 후렴만 가성으로 넘기면 더 높은 곡도 부를 수
              있습니다.
            </p>
          ) : null}

          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            <span className="text-amber-600 dark:text-amber-500">힘줘야</span>는 낼 수는 있지만
            후렴에서 무리가 가는 곡이고, 옆의 숫자만큼 키를 내리면 편해집니다. AI 커버는 어떤
            곡이든 자동으로 맞춰 주지만, 적게 옮길수록 목소리가 자연스러워요.
          </p>
        </div>
      </ResponsiveModal>
    </>
  );
}
