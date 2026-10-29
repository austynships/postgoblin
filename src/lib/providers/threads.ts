import { api, env, form, requireEnv, sleep } from "./http";
import { ProviderError, type Provider } from "./types";

const GRAPH = "https://graph.threads.net/v1.0";

export const threads: Provider = {
  id: "threads",
  name: "Threads",
  color: "#101010",
  maxChars: 500,
  maxMedia: 10,
  connect: "oauth",
  isConfigured: () => !!(env("THREADS_APP_ID") && env("THREADS_APP_SECRET")),
  setupHint: "Set THREADS_APP_ID and THREADS_APP_SECRET (Meta developer app with the Threads use case).",

  async startOAuth({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: requireEnv("THREADS_APP_ID"),
      redirect_uri: redirectUri,
      scope: "threads_basic,threads_content_publish",
      response_type: "code",
      state,
    });
    return `https://threads.net/oauth/authorize?${params}`;
  },

  async finishOAuth({ code, redirectUri }) {
    const short = await api(
      "https://graph.threads.net/oauth/access_token",
      {
        method: "POST",
        body: form({
          client_id: requireEnv("THREADS_APP_ID"),
          client_secret: requireEnv("THREADS_APP_SECRET"),
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      },
      "Threads token",
    );
    const long = await api(
      `https://graph.threads.net/access_token?${new URLSearchParams({
        grant_type: "th_exchange_token",
        client_secret: requireEnv("THREADS_APP_SECRET"),
        access_token: short.access_token,
      })}`,
      {},
      "Threads long-lived token",
    );
    const me = await api(
      `${GRAPH}/me?fields=id,username,name,threads_profile_picture_url&access_token=${long.access_token}`,
      {},
      "Threads profile",
    );
    return [
      {
        externalId: me.id,
        name: me.name || me.username,
        username: me.username,
        avatar: me.threads_profile_picture_url,
        profileUrl: `https://www.threads.net/@${me.username}`,
        expiresAt: Date.now() + long.expires_in * 1000,
        secrets: { accessToken: long.access_token },
      },
    ];
  },

  async refresh(account) {
    // Long-lived tokens (60 days) are refreshed with themselves.
    if (!account.expiresAt || account.expiresAt - Date.now() > 7 * 86400_000) return null;
    const t = await api(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${(account.secrets as any).accessToken}`,
      {},
      "Threads refresh",
    );
    return { secrets: { accessToken: t.access_token }, expiresAt: Date.now() + t.expires_in * 1000 };
  },

  async publish(account, { text, media }) {
    const token = (account.secrets as any).accessToken as string;
    const create = (params: Record<string, string>) =>
      api(`${GRAPH}/me/threads`, { method: "POST", body: form({ ...params, access_token: token }) }, "Threads container");

    const images = media.filter((m) => m.mime.startsWith("image/") || m.mime.startsWith("video/"));
    if (images.some((m) => /localhost|127\.0\.0\.1/.test(m.url))) {
      throw new ProviderError("Threads fetches media by URL — set APP_URL to a public address to post images", false);
    }
    const kind = (m: (typeof images)[number]) => (m.mime.startsWith("video/") ? "VIDEO" : "IMAGE");
    const urlKey = (m: (typeof images)[number]) => (m.mime.startsWith("video/") ? "video_url" : "image_url");

    let container: { id: string };
    if (images.length === 0) {
      container = await create({ media_type: "TEXT", text });
    } else if (images.length === 1) {
      container = await create({ media_type: kind(images[0]), [urlKey(images[0])]: images[0].url, text });
    } else {
      const children: string[] = [];
      for (const m of images.slice(0, 10)) {
        const c = await create({ media_type: kind(m), [urlKey(m)]: m.url, is_carousel_item: "true" });
        children.push(c.id);
      }
      container = await create({ media_type: "CAROUSEL", children: children.join(","), text });
    }

    // Media containers need processing time before they can be published.
    if (images.length) await sleep(15_000);
    const published = await api(
      `${GRAPH}/me/threads_publish`,
      { method: "POST", body: form({ creation_id: container.id, access_token: token }) },
      "Threads publish",
    );
    const info = await api(`${GRAPH}/${published.id}?fields=permalink&access_token=${token}`, {}, "Threads permalink").catch(
      () => ({}) as any,
    );
    return { id: published.id, url: info.permalink };
  },
};
