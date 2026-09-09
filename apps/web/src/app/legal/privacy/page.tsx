import type { Metadata } from "next";

import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";

export const metadata: Metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-semibold">개인정보 처리방침</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          초안입니다. 정식 서비스 전 법률 검토가 필요합니다.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-medium text-foreground">수집하는 정보</h2>
            <p className="mt-2">
              계정 식별을 위한 이메일과 프로필 이미지, 업로드한 음원과 생성된 결과물, 서비스 남용
              방지를 위한 접속 IP를 수집합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">보관 기간</h2>
            <p className="mt-2">
              무료 미리보기의 원본 음원은 7일, 결과물은 30일 후 삭제됩니다. 유료로 생성한 결과물은
              계정이 유지되는 동안 보관합니다. 계정을 삭제하면 관련 데이터가 함께 삭제됩니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">제3자 제공</h2>
            <p className="mt-2">
              이용자의 음원과 결과물을 제3자에게 제공하거나 공개하지 않습니다. 서비스 운영을 위해
              인증과 데이터 저장은 Supabase, 음원 처리는 GPU 연산 제공자를 이용합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">문의</h2>
            <p className="mt-2">
              <a href="mailto:privacy@coverly.app" className="text-foreground underline underline-offset-4">
                privacy@coverly.app
              </a>
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
