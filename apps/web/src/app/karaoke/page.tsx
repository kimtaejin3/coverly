import type { Metadata } from "next";

import { KaraokeDemo } from "@/components/coverly/karaoke-demo";
import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";

export const metadata: Metadata = {
  title: "노래방 음역대 체크",
  description: "30초로 내 음역대를 재고, 노래방 곡을 몇 키 내려야 편하게 부르는지 알려드려요.",
};

export default function KaraokePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="aurora w-full flex-1 overflow-hidden">
        <KaraokeDemo />
      </main>
      <SiteFooter />
    </>
  );
}
