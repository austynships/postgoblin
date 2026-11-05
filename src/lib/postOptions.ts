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
  /** Posted as a reply/comment right after the post, where the platform allows it. */
  firstComment?: string;
};

/** Platforms that post each `---` separated part as a reply to the previous one. */
export const THREAD_PLATFORMS: readonly PlatformId[] = ["x", "bluesky", "mastodon", "threads"];
/** Platforms where PostGoblins can add a first comment. */
export const COMMENT_PLATFORMS: readonly PlatformId[] = [...THREAD_PLATFORMS, "linkedin", "facebook", "instagram"];
/** Comment length limits where they differ from the post limit. */
export const COMMENT_LIMITS: Partial<Record<PlatformId, number>> = { linkedin: 1250, facebook: 8000, instagram: 2200 };
export const MAX_THREAD_PARTS = 25;

const THREAD_BREAK = /^[ \t]*-{3,}[ \t]*$/m;

/** Splits text on lines that contain only `---`. Text without a break is one part. */
export function splitThread(text: string): string[] {
  if (!THREAD_BREAK.test(text)) return [text];
  return text
    .split(new RegExp(THREAD_BREAK.source, "gm"))
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The posts a platform publishes: thread parts, or everything joined into one post. */
export function partsFor(platform: string, text: string): string[] {
  const parts = splitThread(text);
  if (THREAD_PLATFORMS.includes(platform as PlatformId)) return parts;
  return [parts.join("\n\n")];
}

export const supportsComments = (platform: string) => COMMENT_PLATFORMS.includes(platform as PlatformId);

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
  const firstComment = (raw as PostOptions | undefined)?.firstComment;
  if (typeof firstComment === "string" && firstComment.trim()) out.firstComment = firstComment.trim().slice(0, 10_000);
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
