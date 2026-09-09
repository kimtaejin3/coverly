import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses row level security, so it must never be imported into anything
 * that reaches the browser — credit movement, job status writes, and result uploads only.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
