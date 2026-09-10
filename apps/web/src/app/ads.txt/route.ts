import { ADSENSE_CLIENT, ADSENSE_ENABLED } from "@/lib/adsense";

/**
 * GET /ads.txt — the authorised-seller record AdSense checks.
 *
 * Generated rather than committed so the publisher id lives in one place, and so a checkout
 * without the environment variable set never publishes somebody else's id.
 */
export function GET() {
  if (!ADSENSE_ENABLED) {
    return new Response("", { status: 404 });
  }
  const publisher = ADSENSE_CLIENT.replace(/^ca-/, "");
  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
