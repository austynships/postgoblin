import { api, env, form, readMedia, requireEnv } from "./http";
import type { Provider } from "./types";

const graph = () => `https://graph.facebook.com/${env("FACEBOOK_GRAPH_VERSION") ?? "v23.0"}`;

export const facebook: Provider = {
  id: "facebook",
  name: "Facebook Page",
  color: "#0866ff",
  maxChars: 63206,
  maxMedia: 10,
  connect: "oauth",
  isConfigured: () => !!(env("FACEBOOK_APP_ID") && env("FACEBOOK_APP_SECRET")),
  setupHint: "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET (Meta app with pages_manage_posts + pages_show_list).",

  async startOAuth({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: requireEnv("FACEBOOK_APP_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "pages_show_list,pages_manage_posts,pages_read_engagement",
      response_type: "code",
    });
    return `https://www.facebook.com/${env("FACEBOOK_GRAPH_VERSION") ?? "v23.0"}/dialog/oauth?${params}`;
  },

  async finishOAuth({ code, redirectUri }) {
    const appId = requireEnv("FACEBOOK_APP_ID");
    const secret = requireEnv("FACEBOOK_APP_SECRET");
    const short = await api(
      `${graph()}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirectUri, code })}`,
      {},
      "Facebook token",
    );
    const long = await api(
      `${graph()}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: secret,
        fb_exchange_token: short.access_token,
      })}`,
      {},
      "Facebook long-lived token",
    );
    // Page tokens derived from a long-lived user token don't expire.
    const pages = await api(
      `${graph()}/me/accounts?fields=id,name,access_token,picture{url},link&limit=100&access_token=${long.access_token}`,
      {},
      "Facebook pages",
    );
    return (pages.data as any[]).map((p) => ({
      externalId: p.id,
      name: p.name,
      avatar: p.picture?.data?.url,
      profileUrl: p.link ?? `https://www.facebook.com/${p.id}`,
      secrets: { pageToken: p.access_token },
    }));
  },

  async publish(account, { text, media }) {
    const token = (account.secrets as any).pageToken as string;
    const page = account.externalId;
    const images = media.filter((m) => m.mime.startsWith("image/"));

    const uploadPhoto = async (file: (typeof images)[number], published: boolean, caption?: string) => {
      const body = new FormData();
      body.append("source", await readMedia(file), file.name);
      body.append("published", String(published));
      if (caption) body.append("caption", caption);
      body.append("access_token", token);
      return api(`${graph()}/${page}/photos`, { method: "POST", body }, "Facebook photo");
    };

    let postId: string;
    if (images.length === 1) {
      const res = await uploadPhoto(images[0], true, text);
      postId = res.post_id ?? res.id;
    } else {
      const params: Record<string, string> = { message: text, access_token: token };
      if (images.length > 1) {
        const ids = [];
        for (const img of images.slice(0, 10)) ids.push((await uploadPhoto(img, false)).id);
        ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
      }
      const res = await api(`${graph()}/${page}/feed`, { method: "POST", body: form(params) }, "Facebook post");
      postId = res.id;
    }
    return { id: postId, url: `https://www.facebook.com/${postId}` };
  },
};
