import type { SessionUser } from "@/components/coverly/user-menu";

import { FREE_GENERATIONS_PER_ACCOUNT } from "@/lib/config";

import { createClient } from "./server";

/**
 * The signed-in user plus the profile row the app cares about, or null when signed out.
 * Uses getUser(), not getSession(): only getUser() revalidates the token with Supabase, so a
 * forged cookie cannot fake a session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("credit_balance, free_generations_used")
    .eq("id", user.id)
    .maybeSingle();

  return {
    email: user.email ?? null,
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
    creditBalance: profile?.credit_balance ?? 0,
    freeRemaining: Math.max(
      0,
      FREE_GENERATIONS_PER_ACCOUNT - (profile?.free_generations_used ?? 0),
    ),
  };
}
