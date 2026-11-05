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
};

export type PostOptions = {
  youtube?: YouTubeOptions;
};

export const YOUTUBE_PRIVACY: YouTubePrivacy[] = ["public", "unlisted", "private"];
export const YOUTUBE_TITLE_MAX = 100;
/** YouTube allows 500 characters of tags in total. */
export const YOUTUBE_TAGS_MAX_CHARS = 500;

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
  const yt = (raw as PostOptions | undefined)?.youtube;
  if (yt && typeof yt === "object") {
    const clean: YouTubeOptions = {};
    if (typeof yt.title === "string" && yt.title.trim()) clean.title = yt.title.replace(/[<>]/g, "").trim().slice(0, YOUTUBE_TITLE_MAX);
    if (YOUTUBE_PRIVACY.includes(yt.privacy as YouTubePrivacy)) clean.privacy = yt.privacy;
    if (typeof yt.madeForKids === "boolean") clean.madeForKids = yt.madeForKids;
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
