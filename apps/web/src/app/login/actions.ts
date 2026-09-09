"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  // `next` arrives from a form field, so only same-site paths are allowed.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return { email, password, next: safeNext };
}

export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Do not distinguish "no such account" from "wrong password": that difference tells an
    // attacker which addresses are registered.
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message.includes("already") ? "이미 가입된 이메일입니다." : "가입에 실패했습니다." };
  }

  // With email confirmation on, signUp returns a user but no session.
  if (!data.session) {
    return { notice: "확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료해 주세요." };
  }

  revalidatePath("/", "layout");
  redirect(next);
}
