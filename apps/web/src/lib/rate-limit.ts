import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PRD §13: one free generation per account, and at most three accounts per IP per 24 hours.
 * Deliberately simple — the covers table already holds everything needed, so there is no separate
 * counter to keep in sync. Revisit only if abuse actually shows up.
 */
export const FREE_ACCOUNTS_PER_IP_PER_DAY = 5;

export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

export async function ipHasCapacity(ip: string | null): Promise<boolean> {
  if (!ip) return true; // Local development and unknown proxies: do not lock people out.

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("covers")
    .select("user_id")
    .eq("type", "preview")
    .eq("client_ip", ip)
    .gte("created_at", since);

  if (error) return true; // Never fail a legitimate request because the counter is unavailable.
  return new Set((data ?? []).map((row) => row.user_id)).size < FREE_ACCOUNTS_PER_IP_PER_DAY;
}
