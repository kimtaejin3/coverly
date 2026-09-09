import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/coverly/site-footer";
import { SiteHeader } from "@/components/coverly/site-header";
import { Card } from "@/components/ui/card";
import { getSessionUser } from "@/lib/supabase/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
  description: "Coverly에 로그인하고 AI 커버를 만들어 보세요.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const rawNext = typeof query.next === "string" ? query.next : "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (await getSessionUser()) redirect(next);

  return (
    <>
      <SiteHeader />
      <main id="main" className="aurora flex w-full flex-1 flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-sm px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight">로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          만든 커버를 저장하고 언제든 다시 들을 수 있어요.
        </p>
        <Card className="mt-6 p-6">
          <LoginForm next={next} />
        </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
