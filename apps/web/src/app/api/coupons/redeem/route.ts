import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** What each failure means to the person typing the code. */
const MESSAGES: Record<string, string> = {
  invalid: "없는 쿠폰이에요. 코드를 다시 확인해 주세요.",
  expired: "기간이 지난 쿠폰이에요.",
  already: "이미 사용한 쿠폰이에요.",
  exhausted: "이 쿠폰은 준비된 수량이 모두 소진됐어요.",
};

/**
 * POST /api/coupons/redeem — turn a promo code into free generations.
 *
 * The work happens in redeem_coupon(), which locks the row: two people racing for the last slot
 * of a capped code would otherwise both be granted it. Nothing here reads the coupons table
 * directly, so a wrong code cannot be distinguished from an exhausted one by timing or by what
 * comes back.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { code } = await request.json().catch(() => ({}));
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "쿠폰 코드를 입력해 주세요." }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("redeem_coupon", {
    p_user_id: user.id,
    p_code: code.trim().slice(0, 40),
  });
  if (error) {
    return NextResponse.json({ error: "쿠폰을 확인하지 못했어요." }, { status: 500 });
  }

  const result = data as { ok: boolean; reason?: string; granted?: number };
  if (!result?.ok) {
    return NextResponse.json(
      { error: MESSAGES[result?.reason ?? "invalid"] ?? MESSAGES.invalid },
      { status: 400 },
    );
  }

  return NextResponse.json({ granted: result.granted });
}
