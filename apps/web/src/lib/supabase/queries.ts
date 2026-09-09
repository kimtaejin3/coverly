import type { Voice } from "@/lib/types";

import { createClient } from "./server";

interface VoiceRow {
  id: string;
  name: string;
  description: string;
  gender: string;
  tags: string[] | null;
  sample_url: string | null;
  range_label: string | null;
  accent: string | null;
  source_credit: string | null;
  source_license: string | null;
}

function toVoice(row: VoiceRow): Voice {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    gender: row.gender === "male" ? "male" : "female",
    tags: row.tags ?? [],
    sampleUrl: row.sample_url ?? "",
    sampleTitle: `${row.name} 데모`,
    rangeLabel: row.range_label ?? "",
    accent: row.accent ?? "from-primary/20 to-primary/5",
    sourceCredit: row.source_credit,
    sourceLicense: row.source_license,
    isActive: true,
  };
}

/** The catalogue is public, so this works for signed-out visitors too. */
export async function listVoices(): Promise<Voice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("voices")
    .select("id, name, description, gender, tags, sample_url, range_label, accent, source_credit, source_license")
    .eq("is_active", true)
    // RLS also lets the owner read their own personal voice; the catalogue is the shared set only,
    // and the personal one is surfaced separately.
    .is("owner_user_id", null)
    .order("sort_order");

  if (error) throw new Error(`failed to load voices: ${error.message}`);
  return (data ?? []).map(toVoice);
}

export interface RecentCover {
  id: string;
  title: string;
  voiceId: string;
  status: string;
  createdAt: string;
}

/** The signed-in user's own covers, newest first. Row level security scopes this to them. */
export async function listRecentCovers(limit = 8): Promise<RecentCover[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("covers")
    .select("id, title, voice_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    voiceId: row.voice_id,
    status: row.status,
    createdAt: row.created_at,
  }));
}
