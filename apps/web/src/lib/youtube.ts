/**
 * Accepts the URL shapes people actually paste, and nothing else — no shortened redirectors, no
 * playlists, no channel pages. Returning the canonical watch URL means the worker gets one shape.
 */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const ID_PATTERN = /^[\w-]{11}$/;

export function parseYouTubeUrl(input: string): { videoId: string; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!HOSTS.has(parsed.hostname)) return null;

  let id: string | null = null;
  if (parsed.hostname.endsWith("youtu.be")) {
    id = parsed.pathname.slice(1).split("/")[0] ?? null;
  } else if (parsed.pathname === "/watch") {
    id = parsed.searchParams.get("v");
  } else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
    id = parsed.pathname.split("/")[2] ?? null;
  }

  if (!id || !ID_PATTERN.test(id)) return null;
  return { videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
}
