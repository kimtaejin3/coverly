import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/60">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
          Coverly의 결과물은 AI로 생성됩니다. 업로드한 음원을 처리할 권한은 이용자에게 있습니다.
          생성한 커버는 만든 이용자의 계정 안에서만 감상할 수 있으며, 내려받기나 공개 배포는
          제공하지 않습니다.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <Link href="/create" className="transition-colors hover:text-foreground">
            커버 만들기
          </Link>
          <Link href="/legal/terms" className="transition-colors hover:text-foreground">
            이용약관
          </Link>
          <Link href="/legal/privacy" className="transition-colors hover:text-foreground">
            개인정보 처리방침
          </Link>
          <a href="mailto:ktj3727@gmail.com" className="transition-colors hover:text-foreground">
            신고 및 삭제 요청
          </a>
          <span className="ml-auto">© {new Date().getFullYear()} Coverly</span>
        </div>
      </div>
    </footer>
  );
}
