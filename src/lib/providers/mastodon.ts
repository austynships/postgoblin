import { db } from "../db";
import { api, form, readMedia } from "./http";
import { ProviderError, type Provider } from "./types";

type App = { client_id: string; client_secret: string; redirect_uri: string };

function normalizeInstance(input: string) {
  const raw = input.trim().replace(/\/+$/, "");
  if (!raw) throw new ProviderError("Enter your Mastodon server, e.g. mastodon.social", false);
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  return `https://${url.host}`;
}

/** Mastodon apps are registered per server, on demand. */
async function appFor(instance: string, redirectUri: string): Promise<App> {
  const existing = db
    .prepare("SELECT client_id, client_secret, redirect_uri FROM mastodon_apps WHERE instance = ?")
    .get(instance) as App | undefined;
  if (existing && existing.redirect_uri === redirectUri) return existing;

  const app = await api(
    `${instance}/api/v1/apps`,
    {
      method: "POST",
      body: form({
        client_name: "PostGoblins",
        redirect_uris: redirectUri,
        scopes: "read write",
        website: process.env.APP_URL,
      }),
    },
    "Mastodon app registration",
  );
  db.prepare(
    `INSERT INTO mastodon_apps (instance, client_id, client_secret, redirect_uri) VALUES (?, ?, ?, ?)
     ON CONFLICT(instance) DO UPDATE SET client_id = excluded.client_id,
       client_secret = excluded.client_secret, redirect_uri = excluded.redirect_uri`,
  ).run(instance, app.client_id, app.client_secret, redirectUri);
  return { client_id: app.client_id, client_secret: app.client_secret, redirect_uri: redirectUri };
}

export const mastodon: Provider = {
  id: "mastodon",
  name: "Mastodon",
  color: "#6364ff",
  maxChars: 500,
  maxMedia: 4,
  connect: "oauth",
  fields: [{ name: "instance", label: "Server", placeholder: "mastodon.social", required: true }],
  isConfigured: () => true,

  async startOAuth({ state, redirectUri, extra }) {
    const instance = normalizeInstance(extra.instance ?? "");
    extra.instance = instance;
    const app = await appFor(instance, redirectUri);
    const params = new URLSearchParams({
      client_id: app.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "read write",
      state,
    });
    return `${instance}/oauth/authorize?${params}`;
  },

  async finishOAuth({ code, redirectUri, extra }) {
    const instance = extra.instance;
    const app = await appFor(instance, redirectUri);
    const token = await api(
      `${instance}/oauth/token`,
      {
        method: "POST",
        body: form({
          grant_type: "authorization_code",
          code,
          client_id: app.client_id,
          client_secret: app.client_secret,
          redirect_uri: redirectUri,
          scope: "read write",
        }),
      },
      "Mastodon token",
    );
    const me = await api(
      `${instance}/api/v1/accounts/verify_credentials`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      "Mastodon profile",
    );
    return [
      {
        externalId: `${instance}#${me.id}`,
        name: me.display_name || me.username,
        username: `${me.username}@${new URL(instance).host}`,
        avatar: me.avatar,
        profileUrl: me.url,
        secrets: { instance, accessToken: token.access_token },
      },
    ];
  },

  async publish(account, { text, media }) {
    const { instance, accessToken } = account.secrets as Record<string, string>;
    const auth = { Authorization: `Bearer ${accessToken}` };
    const mediaIds: string[] = [];
    for (const file of media.slice(0, 4)) {
      const body = new FormData();
      body.append("file", await readMedia(file), file.name);
      const m = await api(`${instance}/api/v2/media`, { method: "POST", headers: auth, body }, "Mastodon media");
      mediaIds.push(m.id);
    }
    const status = await api(
      `${instance}/api/v1/statuses`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ status: text, media_ids: mediaIds }),
      },
      "Mastodon post",
    );
    return { id: status.id, url: status.url };
  },
};
