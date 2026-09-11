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

/**
 * GET /api/songs — every song we have a range for.
 *
 * The list is small and identical for everyone, so it is cached rather than queried per visitor.
 * Ranking against the caller's own voice happens in the browser, which keeps this cacheable.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("song_ranges")
    .select("title, artist, genre, f0_low, f0_median, f0_high, f0_peak, top_note, source")
    // By top note, easiest first. f0_median was the old axis and it is barely populated -- it was
    // a seed's bucket guess where it existed at all, and 최고음 is what this list is about.
    // Unknown tops sort last: a song we cannot place should not lead the list.
    .order("f0_peak", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ songs: [] }, { status: 200 });
  }
  return NextResponse.json(
    { songs: data ?? [] },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
