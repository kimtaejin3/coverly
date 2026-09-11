/**
 * Google AdSense wiring.
 *
 * Set NEXT_PUBLIC_ADSENSE_CLIENT to the publisher id ("ca-pub-…"); with it unset nothing about
 * the pages changes, so the site runs unchanged until the account is approved.
 *
 * Placement is deliberately narrow. Two separate rules push the same way:
 *
 *  - AdSense's copyrighted-material policy forbids ads on pages hosting content the publisher has
 *    no right to distribute. A cover is the instrumental of a commercial master with a new vocal
 *    over it, which is exactly what reviewers look for.
 *  - 저작권법 제102조's safe harbour requires the operator not to draw *직접적인 금전적 이익*
 *    from the infringing material. An ad unit beside the player is that income, by the plainest
 *    reading of the clause.
 *
 * So the audio-bearing routes are excluded by default. Flip AD_ROUTES if you decide otherwise —
 * it is your call, but make it knowingly.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

export const ADSENSE_ENABLED = ADSENSE_CLIENT.startsWith("ca-pub-");

/**
 * Routes that may carry ad units. Anything serving generated audio is absent on purpose.
 *
 * Worth knowing before you judge the revenue: the traffic is on "/" and "/c/…", and both are
 * excluded here. What is left earns close to nothing. Widening this is the decision that carries
 * the risk described above, and it is yours to make rather than mine.
 */
export const AD_ROUTES = ["/legal/terms", "/legal/privacy"] as const;

export function adsAllowedOn(pathname: string): boolean {
  return ADSENSE_ENABLED && AD_ROUTES.some((route) => pathname === route);
}
