import { pkceChallenge } from "../crypto";
import { api, env, form, readMedia, requireEnv } from "./http";
import type { Provider } from "./types";

const SCOPES = "tweet.read tweet.write users.read offline.access media.write";

function basicAuth() {
  const id = requireEnv("X_CLIENT_ID");
  const secret = requireEnv("X_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function token(params: Record<string, string>) {
  return api(
    "https://api.x.com/2/oauth2/token",
    { method: "POST", headers: { Authorization: basicAuth() }, body: form(params) },
    "X token",
  );
}

export const x: Provider = {
  id: "x",
  name: "X (Twitter)",
  color: "#000000",
  maxChars: 280,
  maxMedia: 4,
  connect: "oauth",
  isConfigured: () => !!(env("X_CLIENT_ID") && env("X_CLIENT_SECRET")),
  setupHint: "Set X_CLIENT_ID and X_CLIENT_SECRET (developer.x.com → your app → OAuth 2.0).",

  async startOAuth({ state, redirectUri, verifier }) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("X_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    return `https://x.com/i/oauth2/authorize?${params}`;
  },

  async finishOAuth({ code, redirectUri, verifier }) {
    const t = await token({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    const { data: me } = await api(
      "https://api.x.com/2/users/me?user.fields=profile_image_url",
      { headers: { Authorization: `Bearer ${t.access_token}` } },
      "X profile",
    );
    return [
      {
        externalId: me.id,
        name: me.name,
        username: me.username,
        avatar: me.profile_image_url,
        profileUrl: `https://x.com/${me.username}`,
        expiresAt: Date.now() + t.expires_in * 1000,
        secrets: { accessToken: t.access_token, refreshToken: t.refresh_token },
      },
    ];
  },

  async refresh(account) {
    const { refreshToken } = account.secrets as Record<string, string>;
    if (!refreshToken) return null;
    const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken },
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  },

  async publish(account, { text, media }) {
    const auth = { Authorization: `Bearer ${(account.secrets as any).accessToken}` };
    const mediaIds: string[] = [];
    for (const file of media.slice(0, 4)) {
      const body = new FormData();
      body.append("media", await readMedia(file), file.name);
      body.append("media_category", file.mime === "image/gif" ? "tweet_gif" : "tweet_image");
      const res = await api("https://api.x.com/2/media/upload", { method: "POST", headers: auth, body }, "X media");
      mediaIds.push(res.data?.id ?? res.media_id_string);
    }
    const res = await api(
      "https://api.x.com/2/tweets",
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
      },
      "X post",
    );
    return { id: res.data.id, url: `https://x.com/${account.username ?? "i"}/status/${res.data.id}` };
  },
};
