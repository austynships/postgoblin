// Shared by server and client: character counting per platform.

export const CHAR_LIMITS: Record<string, number> = {
  x: 280,
  bluesky: 300,
  mastodon: 500,
  threads: 500,
  linkedin: 3000,
  facebook: 63206,
  instagram: 2200,
  youtube: 5000,
  tiktok: 2200,
  discord: 2000,
  telegram: 4096,
};

const URL_RE = /https?:\/\/[^\s]+/g;

/** Approximate each platform's own counting rules. */
export function countChars(provider: string, text: string) {
  if (provider === "x") {
    // X counts every link as 23 characters.
    return [...text.replace(URL_RE, "x".repeat(23))].length;
  }
  if (provider === "mastodon") {
    return [...text.replace(URL_RE, "x".repeat(23))].length;
  }
  // Bluesky counts graphemes; code points are a close approximation.
  return [...text].length;
}

export function overLimit(provider: string, text: string) {
  const limit = CHAR_LIMITS[provider];
  return limit !== undefined && countChars(provider, text) > limit;
}
