"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CaretRight, MagnifyingGlass, Sparkle, X } from "@phosphor-icons/react";

import type { SongRange } from "@/app/api/songs/route";
import { ScaleTest } from "@/components/coverly/scale-test";
import { Button } from "@/components/ui/button";
import { noteName } from "@/lib/pitch";
import { classifyFit } from "@/lib/range";
import { cn } from "@/lib/utils";

/**
 * 노래방 음역대 체크 — the copyright-clean demo surface.
 *
 * No audio upload, no login: it plays reference tones, hears whether you hit them, and reads off
 * where your voice stops. Then it takes the song 최고음 catalogue and tells you, per song, how many
 * keys to drop so you are not the person straining a fourth above their range in front of friends.
 *
 * The AI is not here -- pitch detection is DSP. The AI is the payoff this page hands off to: a
 * cover of the song in your own voice, already at the right key.
 */
type Range = { modalHigh: number; falsettoHigh: number | null };
type KeyFilter = "all" | "comfort" | -1 | -2 | -3 | "deep";

const KEY_FILTERS: { value: KeyFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "comfort", label: "편하게" },
  { value: -1, label: "-1키" },
  { value: -2, label: "-2키" },
  { value: -3, label: "-3키" },
  { value: "deep", label: "-4키+" },
];

const norm = (s: string) => s.normalize("NFC").toLowerCase();

export function KaraokeDemo() {
  const [range, setRange] = useState<Range | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [songs, setSongs] = useState<SongRange[] | null>(null);
  const [query, setQuery] = useState("");
  const [keyFilter, setKeyFilter] = useState<KeyFilter>("all");

  const measured = range !== null;
  const showList = measured || browsing;

  useEffect(() => {
    if (!showList || songs) return;
    fetch("/api/songs")
      .then((r) => r.json())
      .then((d) => setSongs(d.songs ?? []))
      .catch(() => setSongs([]));
  }, [showList, songs]);

  const ranked = useMemo(() => {
    if (!songs) return [];
    const scored = songs.map((song) => ({
      song,
      ...classifyFit(song.f0_peak, range?.modalHigh ?? null),
    }));
    if (!range) return scored;
    return [...scored].sort(
      (a, b) =>
        (a.tier === "comfort" ? 0 : a.tier === "transpose" ? 1 : 2) -
          (b.tier === "comfort" ? 0 : b.tier === "transpose" ? 1 : 2) ||
        Math.abs(a.shift ?? 0) - Math.abs(b.shift ?? 0),
    );
  }, [songs, range]);

  const comfortCount = useMemo(
    () => ranked.filter((r) => r.tier === "comfort").length,
    [ranked],
  );

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return ranked.filter((item) => {
      if (range) {
        if (keyFilter === "comfort" && item.tier !== "comfort") return false;
        if (keyFilter === -1 && !(item.tier === "transpose" && item.shift === -1)) return false;
        if (keyFilter === -2 && !(item.tier === "transpose" && item.shift === -2)) return false;
        if (keyFilter === -3 && !(item.tier === "transpose" && item.shift === -3)) return false;
        if (keyFilter === "deep" && !(item.tier === "transpose" && (item.shift ?? 0) <= -4))
          return false;
      }
      if (!q) return true;
      return norm(item.song.title).includes(q) || norm(item.song.artist).includes(q);
    });
  }, [ranked, query, keyFilter, range]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <header className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkle className="size-3.5" weight="fill" aria-hidden />
          노래방 음역대 체크
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
          안 맞는 키로 부르다 창피당하지 마세요
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          30초면 내 음역대를 재고, 노래방 1,600여 곡 중 어떤 곡을{" "}
          <span className="text-foreground">편하게</span> 부를 수 있는지, 나머지는{" "}
          <span className="text-foreground">몇 키 내려야</span> 하는지 알려드려요.
        </p>
      </header>

      {!showList ? (
        <div className="mt-8">
          <ScaleTest
            onDone={(result) =>
              setRange({
                modalHigh: result.modalTopHz,
                falsettoHigh: result.topHz > result.modalTopHz ? result.topHz : null,
              })
            }
            onCancel={() => setBrowsing(true)}
            cancelLabel="측정 없이 곡만 보기"
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {range ? (
            <div className="rounded-2xl bg-primary/8 p-4">
              <p className="text-sm">
                내 진성 최고음{" "}
                <span className="font-semibold text-primary">{noteName(range.modalHigh)}</span>
                {range.falsettoHigh ? (
                  <span className="text-muted-foreground">
                    {" · "}가성 {noteName(range.falsettoHigh)}
                  </span>
                ) : null}
              </p>
              {comfortCount > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  이 중 <span className="font-medium text-foreground">{comfortCount}곡</span>은 키
                  안 내리고 편하게 부를 수 있어요.
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBrowsing(false);
                setSongs((s) => s);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-2xl bg-primary/8 p-4 text-left transition-colors hover:bg-primary/12"
            >
              <span className="text-sm">
                <span className="block font-medium">음역대를 재면 나에게 맞춰 정렬돼요</span>
                <span className="block text-xs text-muted-foreground">
                  30초면 끝나고, 지금은 전체 목록만 보여드려요
                </span>
              </span>
              <CaretRight className="size-4 shrink-0 text-primary" aria-hidden />
            </button>
          )}

          {/* Search + key filter. */}
          <div className="space-y-2">
            <div className="relative">
              <MagnifyingGlass
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="곡·가수 검색"
                className="w-full rounded-lg border border-border bg-card py-2.5 pr-9 pl-9 text-sm outline-none focus:border-primary/50"
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
            {range ? (
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
              {visible.slice(0, 300).map(({ song, tier, shift }) => (
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
                  >
                    {tier === "comfort" ? "편하게" : tier === "transpose" ? `${shift}키` : "미확인"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The hand-off to the AI. Diagnosis is this page; the fix is a cover in your voice. */}
          <div className="mt-4 rounded-2xl border border-primary/30 bg-card p-4 text-center">
            <p className="text-sm font-medium">키를 내려도 안 되면?</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              그 곡을 <span className="text-foreground">내 목소리로 부른 AI 커버</span>로 만들어
              들어보세요. 못 부르는 고음도 알아서 맞춰 드려요.
            </p>
            <Button asChild className="mt-3 h-11 w-full text-sm">
              <Link href="/">
                <Sparkle className="size-4" weight="fill" aria-hidden />
                내 목소리로 커버 만들기
                <ArrowRight className="size-3.5" weight="bold" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
