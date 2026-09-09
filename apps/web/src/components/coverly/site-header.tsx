import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/supabase/session";

import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 text-[0.95rem] font-semibold">
            <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
              <g stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className="text-primary">
                <line x1="5" y1="13" x2="5" y2="19" />
                <line x1="12" y1="8" x2="12" y2="24" />
                <line x1="19" y1="11" x2="19" y2="21" />
                <line x1="26" y1="14" x2="26" y2="18" />
              </g>
            </svg>
            Coverly
          </Link>
        </div>

        <nav className="flex items-center gap-1">
          {user ? (
            <>
              <span className="tabular hidden px-2 font-mono text-xs text-muted-foreground sm:inline">
                {user.freeRemaining > 0 ? `무료 ${user.freeRemaining}회` : `크레딧 ${user.creditBalance}`}
              </span>
              <UserMenu user={user} />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">로그인</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
