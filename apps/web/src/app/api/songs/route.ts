import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export interface SongRange {
  title: string;
  artist: string;
  genre: string | null;
  f0_low: number | null;
  f0_median: number;
  f0_high: number | null;
  source: "seed" | "measured";
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
    .select("title, artist, genre, f0_low, f0_median, f0_high, source")
    .order("f0_median");

  if (error) {
    return NextResponse.json({ songs: [] }, { status: 200 });
  }
  return NextResponse.json(
    { songs: data ?? [] },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
