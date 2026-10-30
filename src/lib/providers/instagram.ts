import { jpegUrl } from "../media";
import { api, env, form, requireEnv, sleep } from "./http";
import { ProviderError, type MediaFile, type Provider } from "./types";

// Instagram API with Facebook Login (Meta's "API setup with Facebook login").
// Requires an Instagram professional account (Business or Creator) linked to a
// Facebook Page. Uses the same Meta app as Facebook Pages (FACEBOOK_APP_ID /
// FACEBOOK_APP_SECRET) with its own login configuration (INSTAGRAM_CONFIG_ID).
const version = () => env("FACEBOOK_GRAPH_VERSION") ?? "v23.0";
const graph = () => `https://graph.facebook.com/${version()}`;
const SCOPES = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management";

const isVideo = (m: MediaFile) => m.mime.startsWith("video/");

/** Instagram downloads media itself, so every item needs a public URL (photos as JPEG). */
async function publicUrl(m: MediaFile) {
  const url = isVideo(m) ? m.url : await jpegUrl(m);
  if (/\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    throw new ProviderError("Instagram fetches media by URL — it can't reach a localhost address", false);
  }
  return url;
}

/** Containers (especially video) are processed asynchronously before they can be published. */
async function waitUntilReady(containerId: string, token: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await api(`${graph()}/${containerId}?fields=status_code,status&access_token=${token}`, {}, "Instagram status");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new ProviderError(`Instagram couldn't process the media: ${s.status ?? s.status_code}`, false);
    }
    await sleep(4000);
  }
  throw new ProviderError("Instagram is still processing the video; it will be retried", true);
}

export const instagram: Provider = {
  id: "instagram",
  name: "Instagram",
  color: "#e1306c",
  maxChars: 2200,
  maxMedia: 10,
  requiresMedia: "any",
  connect: "oauth",
  isConfigured: () => !!(env("FACEBOOK_APP_ID") && env("FACEBOOK_APP_SECRET") && env("INSTAGRAM_CONFIG_ID")),
  setupHint:
    "Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET and INSTAGRAM_CONFIG_ID (Meta app → Instagram use case → Facebook Login for Business configuration).",

  async startOAuth({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: requireEnv("FACEBOOK_APP_ID"),
      redirect_uri: redirectUri,
      state,
      response_type: "code",
    });
    const configId = env("INSTAGRAM_CONFIG_ID");
    if (configId) params.set("config_id", configId);
    else params.set("scope", SCOPES);
    return `https://www.facebook.com/${version()}/dialog/oauth?${params}`;
  },

  async finishOAuth({ code, redirectUri }) {
    const appId = requireEnv("FACEBOOK_APP_ID");
    const secret = requireEnv("FACEBOOK_APP_SECRET");
    const short = await api(
      `${graph()}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri, code })}`,
      {},
      "Instagram token",
    );
    const long = await api(
      `${graph()}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: secret,
        fb_exchange_token: short.access_token,
      })}`,
      {},
      "Instagram long-lived token",
    );
    // Each Page may have an Instagram professional account linked to it.
    // Page tokens derived from a long-lived user token don't expire.
    const pages = await api(
      `${graph()}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&limit=100&access_token=${long.access_token}`,
      {},
      "Instagram accounts",
    );
    const linked = (pages.data as any[]).filter((p) => p.instagram_business_account?.id);
    if (!linked.length) {
      throw new ProviderError(
        "No Instagram professional account was found. Switch your Instagram to a Business or Creator account, link it to a Facebook Page, and select that Page when connecting.",
        false,
      );
    }
    return linked.map((p) => {
      const ig = p.instagram_business_account;
      return {
        externalId: ig.id,
        name: ig.name || ig.username,
        username: `@${ig.username}`,
        avatar: ig.profile_picture_url,
        profileUrl: `https://www.instagram.com/${ig.username}`,
        secrets: { accessToken: p.access_token, igUserId: ig.id, pageId: p.id },
      };
    });
  },

  async publish(account, { text, media }) {
    const { accessToken: token, igUserId } = account.secrets as Record<string, string>;
    if (!media.length) throw new ProviderError("Instagram posts need at least one photo or video", false);
    const create = (params: Record<string, string>) =>
      api(`${graph()}/${igUserId}/media`, { method: "POST", body: form({ ...params, access_token: token }) }, "Instagram media");

    let containerId: string;
    if (media.length === 1) {
      const m = media[0];
      const url = await publicUrl(m);
      const c = isVideo(m)
        ? await create({ media_type: "REELS", video_url: url, caption: text })
        : await create({ image_url: url, caption: text });
      containerId = c.id;
      if (isVideo(m)) await waitUntilReady(containerId, token, 45_000);
    } else {
      const children: string[] = [];
      for (const m of media.slice(0, 10)) {
        const url = await publicUrl(m);
        const c = isVideo(m)
          ? await create({ media_type: "VIDEO", video_url: url, is_carousel_item: "true" })
          : await create({ image_url: url, is_carousel_item: "true" });
        if (isVideo(m)) await waitUntilReady(c.id, token, 45_000);
        children.push(c.id);
      }
      const c = await create({ media_type: "CAROUSEL", children: children.join(","), caption: text });
      containerId = c.id;
      await waitUntilReady(containerId, token, 20_000);
    }

    const published = await api(
      `${graph()}/${igUserId}/media_publish`,
      { method: "POST", body: form({ creation_id: containerId, access_token: token }) },
      "Instagram publish",
    );
    const info = await api(`${graph()}/${published.id}?fields=permalink&access_token=${token}`, {}, "Instagram permalink").catch(
      () => ({}) as any,
    );
    return { id: published.id, url: info.permalink };
  },
};
