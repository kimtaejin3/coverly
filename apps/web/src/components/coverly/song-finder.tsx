"use client";

import { useEffect, useMemo, useState } from "react";
import { CaretRight, MagnifyingGlass, MusicNotes, X } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { noteName } from "@/lib/pitch";
import { classifyFit, TIER_HINT, TIER_ORDER, type Tier } from "@/lib/range";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { cn } from "@/lib/utils";

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

/**
 * The key filters, as buttons.
 *
 * Matching only ever drops the key (a song above the range) or leaves it ("편하게"), so there is no
 * +key -- every option here is 0 or a drop. -1 through -3 are the keys a 노래방 singer actually
 * reaches for; everything past that is bundled so the row does not become a wall of chips.
 */
type KeyFilter = "all" | "comfort" | -1 | -2 | -3 | "deep";
const KEY_FILTERS: { value: KeyFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "comfort", label: "편하게" },
  { value: -1, label: "-1키" },
  { value: -2, label: "-2키" },
  { value: -3, label: "-3키" },
  { value: "deep", label: "-4키+" },
];

function matchesFilter(item: Ranked, filter: KeyFilter): boolean {
  if (filter === "all") return true;
  if (filter === "comfort") return item.tier === "comfort";
  if (filter === "deep") return item.tier === "transpose" && (item.shift ?? 0) <= -4;
  return item.tier === "transpose" && item.shift === filter;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase();

export function SongFinder({
  modalHigh,
  falsettoHigh,
  onMeasure,
  open,
  onOpenChange,
}: {
  /** 진성 ceiling. Matching compares to this because song 최고음 is 진성 in nearly every row. */
  modalHigh: number | null;
  /** 가성 ceiling. Shown as a footnote -- taking a chorus in falsetto is a real thing people do. */
  falsettoHigh: number | null;
  /** Opens the scale. Offered from inside the list, where the gap is felt. */
  onMeasure?: () => void;
  /** Controlled by the parent so it can put the list back after a measurement. */
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [songs, setSongs] = useState<SongRange[] | null>(null);
  const [query, setQuery] = useState("");
  const [keyFilter, setKeyFilter] = useState<KeyFilter>("all");

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
    const scored = songs.map((song) => ({
      song,
      ...classifyFit(song.f0_peak, modalHigh),
    }));
    if (!modalHigh) return scored;
    return [...scored].sort(
      (a, b) =>
        TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
        Math.abs(a.shift ?? 0) - Math.abs(b.shift ?? 0),
    );
  }, [songs, modalHigh]);

  const comfortCount = useMemo(
    () => ranked.filter((item) => item.tier === "comfort").length,
    [ranked],
  );

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return ranked.filter((item) => {
      if (!matchesFilter(item, keyFilter)) return false;
      if (!q) return true;
      return norm(item.song.title).includes(q) || norm(item.song.artist).includes(q);
    });
  }, [ranked, query, keyFilter]);

  return (
    <>
      {/* A row, not an accordion. Expanding a hundred songs inside a 340px column pushed the
          button that actually makes a cover off the bottom of the screen. */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
      >
        <MusicNotes className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">내 음역대 노래 찾기</span>
          <span className="block truncate text-xs text-muted-foreground">
            {modalHigh
              ? `진성 ${noteName(modalHigh)} 기준${
                  comfortCount > 0 ? ` · 편하게 ${comfortCount}곡` : ""
                }`
              : `${songs?.length ?? 0}곡 · 음역대를 재면 나에게 맞춰 정렬돼요`}
          </span>
        </span>
        <CaretRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title="내 음역대 노래 찾기"
        description={
          modalHigh
            ? "노래방에서 부를 때 기준이에요. 숫자만큼 키를 내리면 편해집니다."
            : "음역대를 재면 부를 수 있는 곡이 앞으로 정렬돼요."
        }
      >
        <div className="space-y-3 pb-1">
          {!modalHigh && onMeasure ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onMeasure();
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-primary/8 px-3 py-2.5 text-left text-xs transition-colors hover:bg-primary/12"
            >
              <span>
                <span className="block font-medium">음역대를 재면 정확해져요</span>
                <span className="block text-muted-foreground">
                  30초면 끝나고, 목소리를 안 만들어도 됩니다
                </span>
              </span>
              <CaretRight className="size-3.5 shrink-0 text-primary" aria-hidden />
            </button>
          ) : null}

          {/* Search + key filter, stuck to the top so they stay reachable while scrolling past a
              thousand songs. The whole block shares one background so the list scrolls under it. */}
          <div className="sticky top-0 z-10 -mx-4 space-y-2 bg-popover px-4 pt-0.5 pb-2">
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="곡·가수 검색"
                className="w-full rounded-lg border border-border bg-card py-2 pr-9 pl-9 text-sm outline-none focus:border-primary/50"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>

            {modalHigh ? (
              <div className="scroll-subtle flex gap-1 overflow-x-auto pb-0.5">
                {KEY_FILTERS.map((f) => (
                  <button
                    key={String(f.value)}
                    type="button"
                    onClick={() => setKeyFilter(f.value)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors",
                      keyFilter === f.value
                        ? "bg-primary/15 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {songs === null ? (
            <p className="py-6 text-center text-xs text-muted-foreground">불러오는 중…</p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {query ? `'${query.trim()}' 검색 결과가 없어요` : "해당하는 곡이 없어요"}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map(({ song, tier, shift }) => (
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
                      tier === "transpose" && "font-mono tabular-nums text-muted-foreground",
                      tier === "unknown" && "text-muted-foreground/60",
                    )}
                    title={TIER_HINT[tier]}
                  >
                    {tier === "comfort" ? "편하게" : tier === "transpose" ? `${shift}키` : "미확인"}
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
            <span className="font-mono text-foreground">N키</span>는 그만큼 키를 내리면 편하게
            부르는 곡이에요. AI 커버는 어떤 곡이든 자동으로 맞춰 주지만, 적게 옮길수록 목소리가
            자연스러워요.
          </p>
        </div>
      </ResponsiveModal>
    </>
  );
}
