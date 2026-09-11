/**
 * Polar as Merchant of Record.
 *
 * Polar is the seller; we are its supplier. That is the whole reason this is usable before a
 * 사업자등록 exists — VAT, the storefront's legal identity, refunds and chargebacks are Polar's,
 * and what remains ours is income tax on the payout.
 *
 * Only voice training is sold. Cover generation is deliberately not a paid product: the pipeline
 * reproduces a commercial master server-side, and charging for that is the exact thing
 * 저작권법 제102조 withholds its safe harbour from.
 */

/** "<product uuid>:<credits>:<price>,…" — price in the currency's own unit (원, not 전). */
const RAW_PRODUCTS = process.env.POLAR_PRODUCTS ?? "";

export interface CreditPack {
  productId: string;
  credits: number;
  /** Whole won. KRW has no minor unit, so this is what Polar charges, not a hundredth of it. */
  price: number;
}

export const CREDIT_PACKS: CreditPack[] = RAW_PRODUCTS.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [productId, credits, price] = entry.split(":");
    return {
      productId: (productId ?? "").trim(),
      credits: Number(credits),
      price: Number(price),
    };
  })
  .filter((pack) => pack.productId && pack.credits > 0);

export const POLAR_ENABLED =
  CREDIT_PACKS.length > 0 && Boolean(process.env.POLAR_ACCESS_TOKEN);

/** Sandbox is a separate host with its own tokens; production tokens do not work there. */
function apiBase(): string {
  return process.env.POLAR_SERVER === "sandbox"
    ? "https://sandbox-api.polar.sh"
    : "https://api.polar.sh";
}

export function packForProduct(productId: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.productId === productId);
}

export async function createCheckout(options: {
  productId: string;
  credits: number;
  userId: string;
  email: string | null;
  successUrl: string;
}): Promise<string | null> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) return null;

  const response = await fetch(`${apiBase()}/v1/checkouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products: [options.productId],
      success_url: options.successUrl,
      // Ties the payment back to the account without trusting anything the browser sends later.
      external_customer_id: options.userId,
      ...(options.email ? { customer_email: options.email } : {}),
      metadata: { user_id: options.userId, credits: String(options.credits) },
    }),
    // A checkout that hangs should fail the click, not the request handler.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { url?: string } | null;
  return data?.url ?? null;
}
