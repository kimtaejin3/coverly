"use client";

import { useState } from "react";
import { CaretRight, WaveSine } from "@phosphor-icons/react";
import { toast } from "sonner";

import { ScaleTest } from "@/components/coverly/scale-test";
import { SongFinder } from "@/components/coverly/song-finder";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { noteName } from "@/lib/pitch";

export interface VocalRange {
  /** Highest 진성 note measured. The single ceiling song matching compares against. */
  modalHigh: number | null;
  /** Highest note reached in 가성, when they used it. Shown, never matched on. */
  falsettoHigh: number | null;
}

/**
 * Measure a range, then use it.
 *
 * The measurement used to live inside voice training, which put a twenty-five minute commitment
 * in front of a thirty second question. They are separate things: the range is a fact about the
 * person and it is useful on its own -- it is what decides which songs get recommended, whether or
 * not a model is ever trained. So it gets its own way in, and training reuses whatever is here.
 */
export function VocalRangeCard({
  signedIn,
  initial,
}: {
  signedIn: boolean;
  initial: VocalRange;
}) {
  const [range, setRange] = useState<VocalRange>(initial);
  const [measuring, setMeasuring] = useState(false);
  const [songsOpen, setSongsOpen] = useState(false);
  // Measuring from inside the song list closes it. Put it back afterwards -- the whole reason they
  // went to measure was to see that list change, and leaving them at the sidebar hides the payoff.
  const [returnToSongs, setReturnToSongs] = useState(false);
  const measured = range.modalHigh !== null;

  async function save(next: VocalRange) {
    setRange(next);
    if (returnToSongs) {
      setReturnToSongs(false);
      setSongsOpen(true);
    }
    if (!signedIn) return;
    try {
      const response = await fetch("/api/me/range", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalHz: next.modalHigh,
          falsettoHz: next.falsettoHigh,
        }),
      });
      if (!response.ok) throw new Error();
      toast.success("음역대를 저장했어요");
    } catch {
      // The value is already on screen and the songs are already re-sorted; losing the write just
      // means re-measuring next visit, which is not worth an error dialog over.
      toast.error("음역대를 저장하지 못했어요. 이번 방문에만 적용됩니다.");
    }
  }

  return (
    <div className="space-y-1.5">
      <ResponsiveModal
        open={measuring}
        onOpenChange={(next) => {
          setMeasuring(next);
          if (!next && returnToSongs) {
            // Backed out rather than finished: still put the list back where they left it.
            setReturnToSongs(false);
            setSongsOpen(true);
          }
        }}
        title={measured ? "음역대 다시 재기" : "내 음역대 재기"}
        description="들려주는 음을 따라 부르면 부를 수 있는 곡을 골라드려요. 30초쯤 걸립니다."
      >
        {measuring ? (
          <ScaleTest
            onDone={(result) => {
              setMeasuring(false);
              void save({
                modalHigh: result.modalTopHz,
                falsettoHigh: result.topHz > result.modalTopHz ? result.topHz : null,
              });
            }}
            onCancel={() => setMeasuring(false)}
            cancelLabel="나중에"
          />
        ) : null}
      </ResponsiveModal>

      <button
        type="button"
        onClick={() => {
          setReturnToSongs(false);
          setMeasuring(true);
        }}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card/50 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
      >
        <WaveSine className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {measured ? "내 음역대" : "내 음역대 재기"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {measured ? (
              <>
                진성 최고 {noteName(range.modalHigh!)}
                {range.falsettoHigh ? ` · 가성 ${noteName(range.falsettoHigh)}` : ""}
              </>
            ) : (
              "30초면 끝나요 · 목소리를 안 만들어도 됩니다"
            )}
          </span>
        </span>
        <CaretRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <SongFinder
        modalHigh={range.modalHigh}
        falsettoHigh={range.falsettoHigh}
        open={songsOpen}
        onOpenChange={setSongsOpen}
        onMeasure={() => {
          setReturnToSongs(true);
          setMeasuring(true);
        }}
      />
    </div>
  );
}
