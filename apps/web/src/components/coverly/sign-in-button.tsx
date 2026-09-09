"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { GoogleIcon } from "@/components/coverly/google-icon";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * PRD §11: users see the product before they are asked to sign in, so this never blocks a page —
 * it appears in the header and at the moment a generation actually needs an account.
 */
export function SignInButton({
  label = "Google로 로그인",
  size = "sm",
  className,
  redirectTo,
  variant,
}: {
  label?: string;
  size?: "sm" | "lg" | "default";
  className?: string;
  redirectTo?: string;
  variant?: "default" | "secondary" | "outline";
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const supabase = createClient();
    // Come back to where the user was, so a sign-in mid-flow does not lose their place.
    const next = redirectTo ?? pathname ?? "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setPending(false);
      toast.error("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      onClick={signIn}
      disabled={pending}
    >
      <GoogleIcon className="size-4" />
      {pending ? "이동 중…" : label}
    </Button>
  );
}
