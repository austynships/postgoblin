import { api, env, form, readMedia, requireEnv, sleep } from "./http";
import { ProviderError, type Provider } from "./types";

// TikTok Content Posting API (Direct Post). One video per post; the post text
// becomes the caption. Until TikTok audits the app, posts are limited to
// private ("only me") visibility.
const OPEN = "https://open.tiktokapis.com/v2";
const SCOPES = "user.info.basic,video.publish,video.upload";

async function token(params: Record<string, string>) {
  const t = await api(
    `${OPEN}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ client_key: requireEnv("TIKTOK_CLIENT_KEY"), client_secret: requireEnv("TIKTOK_CLIENT_SECRET"), ...params }),
    },
    "TikTok token",
  );
  if (t.error && t.error !== "ok" && !t.access_token) {
    throw new ProviderError(`TikTok token: ${t.error_description ?? t.error}`, false);
  }
  return t;
}

/** TikTok returns HTTP 200 with an error object; surface it. */
function check(res: any, label: string) {
  if (res?.error?.code && res.error.code !== "ok") {
    const retryable = ["rate_limit_exceeded", "internal_error"].includes(res.error.code);
    throw new ProviderError(`${label}: ${res.error.message || res.error.code}`, retryable);
  }
  return res.data;
}

export const tiktok: Provider = {
  id: "tiktok",
  name: "TikTok",
  color: "#000000",
  maxChars: 2200,
  maxMedia: 1,
  requiresMedia: "video",
  connect: "oauth",
  isConfigured: () => !!(env("TIKTOK_CLIENT_KEY") && env("TIKTOK_CLIENT_SECRET")),
  setupHint: "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET (developers.tiktok.com → Login Kit + Content Posting API).",

  async startOAuth({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      scope: SCOPES,
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  },

  async finishOAuth({ code, redirectUri }) {
    const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const info = check(
      await api(
        `${OPEN}/user/info/?fields=open_id,avatar_url,display_name`,
        { headers: { Authorization: `Bearer ${t.access_token}` } },
        "TikTok profile",
      ),
      "TikTok profile",
    );
    const user = info.user;
    return [
      {
        externalId: user.open_id ?? t.open_id,
        name: user.display_name || "TikTok account",
        avatar: user.avatar_url,
        expiresAt: Date.now() + t.expires_in * 1000,
        secrets: { accessToken: t.access_token, refreshToken: t.refresh_token, openId: t.open_id },
      },
    ];
  },

  async refresh(account) {
    // Access tokens last 24 hours; refresh tokens a year.
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
    if (!video || media.length !== 1) throw new ProviderError("TikTok posts need exactly one video", false);
    const auth = { Authorization: `Bearer ${(account.secrets as any).accessToken}`, "Content-Type": "application/json; charset=UTF-8" };

    // Which visibility levels this creator may use (unaudited apps: SELF_ONLY only).
    const creator = check(
      await api(`${OPEN}/post/publish/creator_info/query/`, { method: "POST", headers: auth, body: "{}" }, "TikTok creator info"),
      "TikTok creator info",
    );
    const options: string[] = creator.privacy_level_options ?? [];
    const wanted = env("TIKTOK_PRIVACY") ?? "PUBLIC_TO_EVERYONE";
    const privacy = options.includes(wanted) ? wanted : (options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0]);
    if (!privacy) throw new ProviderError("TikTok didn't allow any visibility option for this account", false);

    const init = check(
      await api(
        `${OPEN}/post/publish/video/init/`,
        {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            post_info: {
              title: text.slice(0, 2200),
              privacy_level: privacy,
              disable_comment: false,
              disable_duet: false,
              disable_stitch: false,
            },
            // Files up to 64MB go up in one chunk; larger ones in 10MB chunks.
            source_info: {
              source: "FILE_UPLOAD",
              video_size: video.size,
              chunk_size: chunkSize(video.size),
              total_chunk_count: Math.max(1, Math.floor(video.size / chunkSize(video.size))),
            },
          }),
        },
        "TikTok init",
      ),
      "TikTok init",
    );

    const bytes = new Uint8Array(await (await readMedia(video)).arrayBuffer());
    const size = chunkSize(video.size);
    const chunks = Math.max(1, Math.floor(video.size / size));
    for (let i = 0; i < chunks; i++) {
      const start = i * size;
      const end = i === chunks - 1 ? video.size : start + size; // last chunk takes the remainder
      const res = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": video.mime,
          "Content-Range": `bytes ${start}-${end - 1}/${video.size}`,
        },
        body: bytes.slice(start, end),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new ProviderError(`TikTok upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    // Publishing is asynchronous; wait briefly for TikTok to accept it.
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const status = check(
        await api(
          `${OPEN}/post/publish/status/fetch/`,
          { method: "POST", headers: auth, body: JSON.stringify({ publish_id: init.publish_id }) },
          "TikTok status",
        ),
        "TikTok status",
      );
      if (status.status === "FAILED") throw new ProviderError(`TikTok rejected the video: ${status.fail_reason}`, false);
      if (status.status === "PUBLISH_COMPLETE" || status.status === "SEND_TO_USER_INBOX") break;
    }
    // TikTok's API doesn't return the creator's handle, so there's no reliable post link to show.
    return { id: init.publish_id };
  },
};

function chunkSize(total: number) {
  return total <= 64 * 1024 * 1024 ? total : 10 * 1024 * 1024;
}
