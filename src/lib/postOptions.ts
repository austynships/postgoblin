// Per-platform post settings, shared by the composer, the API, the agent and MCP.

export type YouTubePrivacy = "public" | "unlisted" | "private";

export type YouTubeOptions = {
  /** Video title (max 100). Falls back to the post's first line. */
  title?: string;
  privacy?: YouTubePrivacy;
  /**
   * Whether the video is made for kids (US COPPA). Required for every
   * YouTube upload: there is deliberately no default.
   */
  madeForKids?: boolean;
  tags?: string[];
  /** Media id of an uploaded image to use as the custom thumbnail. */
  thumbnailId?: string;
};

/** Every platform id (kept here so client code needn't import the providers). */
export const PLATFORM_IDS = [
  "x",
  "bluesky",
  "mastodon",
  "linkedin",
  "threads",
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "discord",
  "telegram",
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type PostOptions = {
  youtube?: YouTubeOptions;
  /** Per-platform text that replaces the main content on that platform. */
  text?: Partial<Record<PlatformId, string>>;
};

/** The text a platform actually gets: its own version, or the main content. */
export function textFor(content: string, options: PostOptions | undefined, platform: string) {
  return options?.text?.[platform as PlatformId] ?? content;
}

export const YOUTUBE_PRIVACY: YouTubePrivacy[] = ["public", "unlisted", "private"];
export const YOUTUBE_TITLE_MAX = 100;
/** YouTube allows 500 characters of tags in total. */
export const YOUTUBE_TAGS_MAX_CHARS = 500;
/** Thumbnails are converted to JPEG on upload; this caps the original image. */
export const YOUTUBE_THUMBNAIL_MAX_BYTES = 20 * 1024 * 1024;

/** First non-empty line of the post, cleaned for use as a YouTube title. */
export function defaultYouTubeTitle(content: string) {
  const first = content.split("\n").find((l) => l.trim())?.trim() ?? "";
  return first.replace(/[<>]/g, "").slice(0, YOUTUBE_TITLE_MAX) || "New video";
}

export function parseTags(input: string | string[] | undefined): string[] {
  const list = Array.isArray(input) ? input : (input ?? "").split(",");
  return [...new Set(list.map((t) => t.replace(/^#/, "").trim()).filter(Boolean))];
}

/** Keeps only known fields with valid values. */
export function sanitizeOptions(raw: unknown): PostOptions {
  const out: PostOptions = {};
  const text = (raw as PostOptions | undefined)?.text;
  if (text && typeof text === "object") {
    const clean: PostOptions["text"] = {};
    for (const p of PLATFORM_IDS) {
      const v = text[p];
      if (typeof v === "string" && v.trim()) clean[p] = v.trim().slice(0, 70_000);
    }
    if (Object.keys(clean).length) out.text = clean;
  }
  const yt = (raw as PostOptions | undefined)?.youtube;
  if (yt && typeof yt === "object") {
    const clean: YouTubeOptions = {};
    if (typeof yt.title === "string" && yt.title.trim()) clean.title = yt.title.replace(/[<>]/g, "").trim().slice(0, YOUTUBE_TITLE_MAX);
    if (YOUTUBE_PRIVACY.includes(yt.privacy as YouTubePrivacy)) clean.privacy = yt.privacy;
    if (typeof yt.madeForKids === "boolean") clean.madeForKids = yt.madeForKids;
    if (typeof yt.thumbnailId === "string" && /^[\w-]{1,64}$/.test(yt.thumbnailId)) clean.thumbnailId = yt.thumbnailId;
    const tags = parseTags(yt.tags);
    if (tags.length) clean.tags = tags;
    out.youtube = clean;
  }
  return out;
}

/** Problems that block publishing to YouTube (empty list = OK). */
export function youtubeProblems(options: PostOptions): string[] {
  const yt = options.youtube ?? {};
  const problems: string[] = [];
  if (typeof yt.madeForKids !== "boolean") problems.push("YouTube: choose whether the video is made for kids");
  if ((yt.tags ?? []).join(",").length > YOUTUBE_TAGS_MAX_CHARS) {
    problems.push(`YouTube: tags must total ${YOUTUBE_TAGS_MAX_CHARS} characters or fewer`);
  }
  return problems;
}
