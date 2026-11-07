// Turns any profile URL or @handle into one stable key per person, so the same profile is
// never added twice: lowercase, no protocol/www, no query string, no trailing slash.

import { PLATFORMS, platformDef, type PlatformId } from "./platforms";

export type NormalizedProfile = { platform: PlatformId; key: string; url: string };

function parseUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

function bareHost(u: URL) {
  return u.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.|web\.|[a-z]{2}\.)(?=[^.]+\.[^.]+$)/, "").replace(/^www\./, "");
}

/** Which network a URL belongs to, or null. */
export function detectPlatform(raw: string): PlatformId | null {
  const u = parseUrl(raw);
  if (!u || !u.hostname.includes(".")) return null;
  const host = bareHost(u);
  for (const p of PLATFORMS) if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p.id;
  return null;
}

function cleanHandle(h: string) {
  return h.trim().replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * Normalise a profile URL or handle for `platform`. Returns null if it can't identify a person
 * (empty input, wrong network, or a bare home page).
 */
export function normalizeProfile(platform: PlatformId, raw: string): NormalizedProfile | null {
  const def = platformDef(platform);
  const input = (raw ?? "").trim();
  if (!def || !input) return null;

  const looksLikeUrl = /^[a-z]+:\/\//i.test(input) || detectPlatform(input) !== null;

  if (def.idKind === "handle") {
    let handle: string;
    if (looksLikeUrl) {
      if (detectPlatform(input) !== platform) return null;
      const u = parseUrl(input)!;
      const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
      handle = cleanHandle(decodeURIComponent(first));
    } else handle = cleanHandle(input);
    if (!handle || !/^[\w.]+$/.test(handle)) return null;
    return { platform, key: handle, url: def.profileUrl ? def.profileUrl(handle) : handle };
  }

  // URL platforms (LinkedIn, Facebook): the path identifies the person.
  if (!looksLikeUrl) {
    // A bare slug like "jane-doe" → treat as the public profile slug.
    const slug = cleanHandle(input);
    if (!slug || !/^[\w.-]+$/.test(slug)) return null;
    const path = platform === "linkedin" ? `in/${slug}` : slug;
    return { platform, key: `${def.hosts[0]}/${path}`, url: `https://www.${def.hosts[0]}/${path}` };
  }
  if (detectPlatform(input) !== platform) return null;
  const u = parseUrl(input)!;
  let path = decodeURIComponent(u.pathname).toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "").replace(/^\//, "");
  // Facebook's numeric profiles are the one place the query string *is* the identity.
  if (platform === "facebook" && path === "profile.php") {
    const id = u.searchParams.get("id");
    if (!id || !/^\d+$/.test(id)) return null;
    path = `profile.php?id=${id}`;
  }
  if (platform === "linkedin") {
    // /in/jane-doe/details/experience → /in/jane-doe
    const m = path.match(/^(in|company|school|sales\/lead|sales\/people|pub)\/([^/]+)/);
    if (m) path = `${m[1]}/${m[2]}`;
  }
  if (!path) return null;
  const host = def.hosts[0];
  return { platform, key: `${host}/${path}`, url: `https://www.${host}/${path}` };
}

/** Detect the platform and normalise in one go (for the bookmarklet and imports). */
export function normalizeAny(raw: string): NormalizedProfile | null {
  const p = detectPlatform(raw);
  return p ? normalizeProfile(p, raw) : null;
}

/** "Jane Doe | LinkedIn" / "Jane Doe (@jane) • Instagram photos" → "Jane Doe". */
export function nameFromPageTitle(title: string): string {
  return (title ?? "")
    .replace(/^\(\d+\+?\)\s*/, "")
    .split(/\s[|•·–—-]\s/)[0]
    .replace(/\s*\(@[^)]*\)\s*/g, " ")
    .replace(/\s+on (Instagram|Threads|TikTok|X)\b.*$/i, "")
    .trim()
    .slice(0, 200);
}
