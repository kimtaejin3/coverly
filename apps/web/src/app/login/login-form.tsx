"use client";

import { useActionState, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

import { SignInButton } from "@/components/coverly/sign-in-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { signInWithPassword, signUpWithPassword, type AuthFormState } from "./actions";

const EMPTY: AuthFormState = {};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
  const [state, formAction, pending] = useActionState(action, EMPTY);

  return (
    <div className="space-y-5">
      <SignInButton
        size="lg"
        variant="secondary"
        className="h-12 w-full text-base"
        label="Google로 계속하기"
        redirectTo={next}
      />

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">또는 이메일로</span>
        <Separator className="flex-1" />
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            placeholder={mode === "signup" ? "8자 이상" : ""}
          />
        </div>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state.notice ? (
          <Alert>
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
          {pending ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : null}
          {mode === "signin" ? "로그인" : "가입하기"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signin" ? "아직 계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "가입하기" : "로그인"}
        </button>
      </p>
    </div>
  );
}
