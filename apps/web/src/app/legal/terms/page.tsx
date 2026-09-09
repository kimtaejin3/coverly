import type { Metadata } from "next";

import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <h1 className="text-3xl font-semibold">이용약관</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          초안입니다. 정식 서비스 전 법률 검토가 필요합니다.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-medium text-foreground">업로드하는 음원</h2>
            <p className="mt-2">
              이용자는 업로드한 음원을 처리할 권한이 있음을 확인합니다. 권한 없는 음원의 업로드로
              발생하는 책임은 이용자에게 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">결과물의 사용</h2>
            <p className="mt-2">
              Coverly는 생성된 커버를 공개 페이지에 게시하지 않습니다. 이용자는 결과물을 내려받아
              보관하고 감상할 수 있습니다. 결과물을 외부에 공유하거나 배포하는 행위는 이용자의
              판단과 책임으로 이루어지며, 이 경우 원곡의 저작권 및 저작인접권 관계를 이용자가 직접
              확인해야 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">Voice</h2>
            <p className="mt-2">
              Coverly가 제공하는 Voice는 사용 권리를 확보했거나 직접 제작한 목소리입니다. 실존
              인물의 음성을 무단으로 제공하지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">AI 생성물 표시</h2>
            <p className="mt-2">
              Coverly의 결과물은 인공지능으로 생성됩니다. 관련 법령에 따라 화면과 파일 메타데이터에
              이를 표시합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">공유 링크</h2>
            <p className="mt-2">
              커버의 공유 링크는 생성일로부터 30일이 지나면 열리지 않습니다. 만료된 링크로는 결과물이
              재생되지 않으며, 만든 이용자 본인은 언제든 계정에서 결과물을 확인할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-foreground">
              복제·전송 중단 요구 (저작권법 제103조)
            </h2>
            <p className="mt-2">
              권리 침해가 의심되는 콘텐츠의 복제·전송 중단 요구는 아래 담당자에게 접수합니다.
            </p>
            <p className="mt-3">
              담당자: 김태진 ·{" "}
              <a
                href="mailto:ktj3727@gmail.com"
                className="text-foreground underline underline-offset-4"
              >
                ktj3727@gmail.com
              </a>
            </p>
            <p className="mt-3">
              소명 자료와 함께 접수해 주시면 지체 없이 해당 콘텐츠의 공유 링크를 차단하고 결과물을
              삭제한 뒤, 처리 결과를 회신합니다. 반복적으로 권한 없는 음원을 업로드한 계정은 이용을
              제한합니다.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
