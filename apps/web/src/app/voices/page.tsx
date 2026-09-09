import type { Metadata } from "next";
import Link from "next/link";

import { AiNotice } from "@/components/coverly/ai-notice";
import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";
import { VoiceCard } from "@/components/coverly/voice-card";
import { Button } from "@/components/ui/button";
import { listVoices } from "@/lib/supabase/queries";

export const metadata: Metadata = {
  title: "Voice",
  description: "Coverly가 제공하는 AI Voice를 듣고 골라보세요.",
};

export default async function VoicesPage() {
  const voices = await listVoices();
  const credits = [...new Set(voices.map((v) => v.sourceCredit).filter(Boolean))] as string[];

  return (
    <>
      <SiteHeader />
      <main id="main" className="aurora w-full flex-1 overflow-hidden">
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <AiNotice />
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Voice</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Coverly의 모든 Voice는 사용 권리를 확보했거나 직접 제작한 목소리입니다. 아래 데모는
            저희가 권리를 가진 반주 위에서 각 Voice가 부른 것입니다.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {voices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                action={
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/?voice=${voice.id}`}>이 Voice로</Link>
                  </Button>
                }
              />
            ))}
          </div>

          {/* CC BY obliges us to credit the source wherever the work appears, so the credits sit
              with the catalogue rather than in a file nobody reads. */}
          {credits.length > 0 ? (
            <section className="mt-14 border-t border-border/60 pt-8">
              <h2 className="text-sm font-medium">출처</h2>
              <ul className="mt-3 space-y-2">
                {credits.map((credit) => (
                  <li key={credit} className="text-xs leading-relaxed text-muted-foreground">
                    {credit}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
