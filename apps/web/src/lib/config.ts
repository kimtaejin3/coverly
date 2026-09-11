/** Product constants from the PRD, kept in one place so pricing and limits stay editable. */
export const UPLOAD = {
  maxBytes: 50 * 1024 * 1024, // PRD §7
  maxDurationSeconds: 5 * 60,
  acceptedTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"],
  acceptedLabel: "MP3, WAV, M4A · 최대 50MB · 5분 이내",
} as const;

export const PREVIEW: { durationSeconds: number; defaultStartSeconds: number } = {
  durationSeconds: 30, // free preview length is fixed (PRD §12)
  defaultStartSeconds: 30,
};

/**
 * Free previews per account, before any coupon. Two rather than one: a single generation leaves
 * nothing to compare against, and the first attempt is often the wrong section of a song. The
 * rest of the allowance arrives through a promo code, so this is the number that decides how much
 * someone can try before they have a reason to talk to us.
 *
 * Lives here rather than in the database so changing it is a deploy, not a migration. A single
 * account can be raised past it with users.free_generation_limit.
 */
export const FREE_GENERATIONS_PER_ACCOUNT = 2;

/**
 * Personal voices per account. Each one is ~20 GPU-minutes and a 750 MB checkpoint in the volume,
 * so the ceiling is about storage rather than fairness; credits pace the rest.
 */
export const MAX_PERSONAL_VOICES = 5;

/** What one promo coupon adds. Must match the coupons table's default. */
export const COUPON_GENERATIONS = 5;

export const PRICING = {
  fullCoverKrw: 2900,
  packs: [
    { credits: 1, krw: 2900, label: "1곡" },
    { credits: 3, krw: 6900, label: "3곡", note: "20% 할인" },
    { credits: 10, krw: 19900, label: "10곡", note: "31% 할인" },
  ],
} as const;

/**
 * YouTube import. Off by default: YouTube blocks datacenter IPs with a bot check, so the fetch
 * fails from any cloud host, and the only ways around that check are circumventions of it.
 * Set NEXT_PUBLIC_YOUTUBE_ENABLED=true to show the tab anyway.
 */
export const YOUTUBE_ENABLED = process.env.NEXT_PUBLIC_YOUTUBE_ENABLED === "true";
