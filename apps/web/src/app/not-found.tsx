import Link from "next/link";

import { SiteFooter } from "@/components/coverly/site-footer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-24">
        <p className="tabular font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">여기엔 아무것도 없어요</h1>
        <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
          주소가 바뀌었거나, 만든 사람만 볼 수 있는 커버일 수 있습니다. Coverly는 커버를 공개
          페이지에 게시하지 않아 다른 사람의 커버는 열리지 않습니다.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">홈으로</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/create">커버 만들기</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
