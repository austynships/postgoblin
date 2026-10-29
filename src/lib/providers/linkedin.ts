import { api, env, form, readMedia, requireEnv } from "./http";
import { ProviderError, type Provider } from "./types";

const version = () => env("LINKEDIN_VERSION") ?? "202605";

/** LinkedIn "little text" format: reserved characters must be backslash-escaped. */
function escapeCommentary(text: string) {
  return text.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
}

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": version(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

export const linkedin: Provider = {
  id: "linkedin",
  name: "LinkedIn",
  color: "#0a66c2",
  maxChars: 3000,
  maxMedia: 9,
  connect: "oauth",
  isConfigured: () => !!(env("LINKEDIN_CLIENT_ID") && env("LINKEDIN_CLIENT_SECRET")),
  setupHint: "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET (add the OpenID Connect + Share on LinkedIn products).",

  async startOAuth({ state, redirectUri }) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "openid profile w_member_social",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  },

  async finishOAuth({ code, redirectUri }) {
    const t = await api(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        body: form({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: requireEnv("LINKEDIN_CLIENT_ID"),
          client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
        }),
      },
      "LinkedIn token",
    );
    const me = await api(
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${t.access_token}` } },
      "LinkedIn profile",
    );
    return [
      {
        externalId: me.sub,
        name: me.name,
        avatar: me.picture,
        expiresAt: Date.now() + t.expires_in * 1000,
        secrets: { accessToken: t.access_token, refreshToken: t.refresh_token, author: `urn:li:person:${me.sub}` },
      },
    ];
  },

  async refresh(account) {
    const { refreshToken } = account.secrets as Record<string, string>;
    // Refresh tokens are only issued to approved partner apps; others must reconnect.
    if (!refreshToken) return null;
    const t = await api(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        body: form({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: requireEnv("LINKEDIN_CLIENT_ID"),
          client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
        }),
      },
      "LinkedIn refresh",
    );
    return {
      secrets: { ...account.secrets, accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken },
      expiresAt: Date.now() + t.expires_in * 1000,
    };
  },

  async publish(account, { text, media }) {
    const { accessToken, author } = account.secrets as Record<string, string>;
    if (account.expiresAt && account.expiresAt < Date.now()) {
      throw new ProviderError("LinkedIn token expired — reconnect the account", false);
    }
    const imageUrns: string[] = [];
    for (const file of media.filter((m) => m.mime.startsWith("image/")).slice(0, 9)) {
      const init = await api(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        {
          method: "POST",
          headers: headers(accessToken),
          body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
        },
        "LinkedIn image init",
      );
      const put = await fetch(init.value.uploadUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: await readMedia(file),
      });
      if (!put.ok) throw new ProviderError(`LinkedIn image upload ${put.status}`);
      imageUrns.push(init.value.image);
    }

    const body: Record<string, unknown> = {
      author,
      commentary: escapeCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (imageUrns.length === 1) body.content = { media: { id: imageUrns[0] } };
    if (imageUrns.length > 1) body.content = { multiImage: { images: imageUrns.map((id) => ({ id })) } };

    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: headers(accessToken),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new ProviderError(`LinkedIn post ${res.status}: ${detail.slice(0, 300)}`, res.status >= 500 || res.status === 429);
    }
    const urn = res.headers.get("x-restli-id") ?? "";
    return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : undefined };
  },
};
