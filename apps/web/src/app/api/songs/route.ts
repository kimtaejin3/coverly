import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export interface SongRange {
  title: string;
  artist: string;
  genre: string | null;
  f0_low: number | null;
  f0_median: number;
  f0_high: number | null;
  f0_peak: number | null;
  top_note: string | null;
  source: "seed" | "reference" | "measured";
}

/** PostgREST caps a single response (1000 rows on the hosted default), so the catalogue is paged. */
const PAGE = 1000;

/**
 * GET /api/songs — every song we have a range for.
 *
 * Identical for everyone and ranked against the caller's voice in the browser, so it is cached
 * rather than queried per visitor. It is fetched in pages: the catalogue passed a thousand rows
 * once the blog list went in, and a single query silently returned only the lowest thousand --
 * which, sorted by top note, meant every high song vanished and a soprano saw nothing in range.
 */
export async function GET() {
  const supabase = await createClient();
  const songs: SongRange[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("song_ranges")
      .select("title, artist, genre, f0_low, f0_median, f0_high, f0_peak, top_note, source")
      // By top note, easiest first. f0_median was the old axis and barely populated; 최고음 is what
      // this list is about. Unknown tops sort last -- a song we cannot place should not lead.
      .order("f0_peak", { ascending: true, nullsFirst: false })
      // A stable tiebreaker, or a row on a page boundary could repeat or drop between pages.
      .order("title", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // A later page failing should not throw away the songs already gathered.
      return NextResponse.json({ songs }, { status: 200 });
    }
    songs.push(...((data as SongRange[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json(
    { songs },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
