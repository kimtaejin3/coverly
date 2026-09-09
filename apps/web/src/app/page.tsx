import type { Metadata } from "next";
import { Suspense } from "react";

import type { PersonalVoice } from "@/components/coverly/my-voice";
import { SiteHeader } from "@/components/coverly/site-header";
import { Workspace } from "@/components/coverly/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { listRecentCovers, listVoices, type RecentCover } from "@/lib/supabase/queries";
import { getSessionUser } from "@/lib/supabase/session";

export const metadata: Metadata = {
  title: "Coverly — 좋아하는 노래를 새로운 목소리로",
};

async function loadPersonalVoice(): Promise<PersonalVoice | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("voices")
    .select("id, name, status, error_message, training_progress, training_stage")
    // Excluding the catalogue leaves only rows the "owner reads own voices" policy allows,
    // so this can only ever return the caller's own voice.
    .not("owner_user_id", "is", null)
    .maybeSingle();
  return (data as PersonalVoice | null) ?? null;
}

export default async function HomePage() {
  const [voices, user] = await Promise.all([listVoices(), getSessionUser()]);

  // These two do not depend on each other, and a serial await here costs a full round trip to
  // Supabase before the page can render.
  const [recent, personalVoice] = user
    ? await Promise.all([listRecentCovers(6), loadPersonalVoice()])
    : [[] as RecentCover[], null];

  return (
    <>
      <SiteHeader />
      <main id="main" className="aurora flex-1 overflow-hidden">
        {/* useSearchParams inside Workspace needs a boundary or the route bails to client render. */}
        <Suspense
          fallback={
            <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-6 lg:grid-cols-[22rem_1fr]">
              <Skeleton className="h-96 rounded-2xl" />
              <Skeleton className="h-96 rounded-2xl" />
            </div>
          }
        >
          <Workspace
            voices={voices}
            signedIn={Boolean(user)}
            recent={recent}
            personalVoice={personalVoice}
          />
        </Suspense>
      </main>
    </>
  );
}
