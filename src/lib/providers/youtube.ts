import { pkceChallenge } from "../crypto";
import { api, env, form, readMedia, requireEnv } from "./http";
import { ProviderError, type Provider } from "./types";

// YouTube Data API v3 with Google OAuth. One video per post: the first line of
// the post becomes the title, the full text the description.
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

function title(text: string) {
  const first = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  const clean = first.replace(/[<>]/g, ""); // YouTube rejects angle brackets in titles
  return (clean || "New video").slice(0, 100);
}

async function token(params: Record<string, string>) {
  return api(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: form({
        client_id: requireEnv("YOUTUBE_CLIENT_ID"),
        client_secret: requireEnv("YOUTUBE_CLIENT_SECRET"),
        ...params,
      }),
    },
    "YouTube token",
  );
}

export const youtube: Provider = {
  id: "youtube",
  name: "YouTube",
  color: "#ff0000",
  maxChars: 5000,
  maxMedia: 1,
  requiresMedia: "video",
  connect: "oauth",
  isConfigured: () => !!(env("YOUTUBE_CLIENT_ID") && env("YOUTUBE_CLIENT_SECRET")),
  setupHint: "Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (Google Cloud → YouTube Data API v3 → OAuth client).",

  async startOAuth({ state, redirectUri, verifier }) {
    const params = new URLSearchParams({
      client_id: requireEnv("YOUTUBE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent", // always return a refresh token
      include_granted_scopes: "true",
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async finishOAuth({ code, redirectUri, verifier }) {
    const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
    const res = await api(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${t.access_token}` } },
      "YouTube channel",
    );
    const channels = (res.items ?? []) as any[];
    if (!channels.length) {
      throw new ProviderError("This Google account has no YouTube channel yet — create one on youtube.com first", false);
    }
    return channels.map((ch) => ({
      externalId: ch.id,
      name: ch.snippet.title,
      username: ch.snippet.customUrl,
      avatar: ch.snippet.thumbnails?.default?.url,
      profileUrl: ch.snippet.customUrl ? `https://www.youtube.com/${ch.snippet.customUrl}` : `https://www.youtube.com/channel/${ch.id}`,
      expiresAt: Date.now() + t.expires_in * 1000,
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token },
    }));
  },

  async refresh(account) {
    const { refreshToken } = account.secrets as Record<string, string>;
    if (!refreshToken) return null;
    const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      secrets: { ...account.secrets, accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken },
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  },

  async publish(account, { text, media }) {
    const video = media.find((m) => m.mime.startsWith("video/"));
    if (!video || media.length !== 1) throw new ProviderError("YouTube posts need exactly one video", false);
    const auth = { Authorization: `Bearer ${(account.secrets as any).accessToken}` };

    // Resumable upload: create the session with metadata, then send the bytes.
    const init = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          ...auth,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": video.mime,
          "X-Upload-Content-Length": String(video.size),
        },
        body: JSON.stringify({
          snippet: { title: title(text), description: text.slice(0, 5000), categoryId: "22" },
          status: {
            privacyStatus: env("YOUTUBE_PRIVACY") ?? "public",
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );
    if (!init.ok) {
      const detail = await init.text();
      throw new ProviderError(`YouTube upload ${init.status}: ${detail.slice(0, 300)}`, init.status >= 500 || init.status === 429);
    }
    const sessionUrl = init.headers.get("location");
    if (!sessionUrl) throw new ProviderError("YouTube didn't return an upload URL");

    const uploaded = await api(
      sessionUrl,
      { method: "PUT", headers: { "Content-Type": video.mime }, body: await readMedia(video), signal: AbortSignal.timeout(280_000) },
      "YouTube upload",
    );
    return { id: uploaded.id, url: `https://www.youtube.com/watch?v=${uploaded.id}` };
  },
};
