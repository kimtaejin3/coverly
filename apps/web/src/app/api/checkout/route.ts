import { NextResponse, type NextRequest } from "next/server";

import { CREDIT_PACKS, POLAR_ENABLED, createCheckout } from "@/lib/polar";
import { createClient } from "@/lib/supabase/server";

/** GET /api/checkout — the packs on offer. Product ids are not secret; the access token is. */
export async function GET() {
  return NextResponse.json({
    enabled: POLAR_ENABLED,
    packs: CREDIT_PACKS.map(({ productId, credits, priceCents }) => ({
      productId,
      credits,
      priceCents,
    })),
  });
}

/** POST /api/checkout — hand back a Polar checkout URL for one credit pack. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!POLAR_ENABLED) {
    return NextResponse.json({ error: "결제 준비 중입니다." }, { status: 503 });
  }

  const { productId } = await request.json().catch(() => ({}));
  // The pack is looked up server-side; the body only names which one, never how much it grants.
  const pack = CREDIT_PACKS.find((item) => item.productId === productId);
  if (!pack) {
    return NextResponse.json({ error: "없는 상품입니다." }, { status: 400 });
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin.replace(/\/$/, "");
  const url = await createCheckout({
    productId: pack.productId,
    credits: pack.credits,
    userId: user.id,
    email: user.email ?? null,
    successUrl: `${origin}/?purchased=1`,
  });

  if (!url) {
    return NextResponse.json({ error: "결제를 시작하지 못했습니다." }, { status: 502 });
  }
  return NextResponse.json({ url });
}
