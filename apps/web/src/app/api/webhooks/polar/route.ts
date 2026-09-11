import { NextResponse, type NextRequest } from "next/server";
import { Webhook } from "standardwebhooks";

import { packForProduct } from "@/lib/polar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/webhooks/polar — grant credits once an order is actually paid.
 *
 * Everything that decides how many credits to grant is read from our own product table, not from
 * the payload: a forged body cannot mint credits even if the signature check were bypassed.
 *
 * Deliveries retry, so this has to be idempotent. grant_credits() keys off the order id and
 * returns the existing balance on a second call, and the payments table has a unique index on
 * (provider, provider_payment_id).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // The signature covers the exact bytes sent, so the body must be read raw and only parsed after.
  const raw = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
  };

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    // Secrets issued before 2026-09-08 are raw Polar HMAC and must be base64-encoded first; newer
    // whsec_ secrets are passed through untouched.
    const key = secret.startsWith("whsec_")
      ? secret
      : Buffer.from(secret, "utf8").toString("base64");
    event = new Webhook(key).verify(raw, headers) as typeof event;
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  if (event.type !== "order.paid") {
    // Acknowledged so Polar stops retrying events we do not act on.
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const order = (event.data ?? {}) as {
    id?: string;
    amount?: number;
    currency?: string;
    product_id?: string;
    product?: { id?: string };
    metadata?: Record<string, string>;
    customer?: { external_id?: string };
  };

  const orderId = order.id;
  const productId = order.product_id ?? order.product?.id ?? "";
  const userId = order.customer?.external_id ?? order.metadata?.user_id ?? "";
  const pack = packForProduct(productId);

  if (!orderId || !userId || !pack) {
    // A 200 keeps Polar from retrying something retrying will not fix; the row is simply not ours.
    return NextResponse.json({ ok: true, skipped: "unmapped order" });
  }

  const admin = createAdminClient();
  await admin.from("payments").upsert(
    {
      user_id: userId,
      provider: "polar",
      provider_payment_id: orderId,
      amount_cents: order.amount ?? pack.priceCents,
      currency: (order.currency ?? "usd").toLowerCase(),
      credits: pack.credits,
      status: "succeeded",
    },
    { onConflict: "provider,provider_payment_id" },
  );

  const { error } = await admin.rpc("grant_credits", {
    p_user_id: userId,
    p_credits: pack.credits,
    p_payment_id: orderId,
  });
  if (error) {
    // Let Polar retry: the money is taken and the credits are not in yet.
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, credits: pack.credits });
}
