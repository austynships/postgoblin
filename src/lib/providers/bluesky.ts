import { api, readMedia } from "./http";
import { ProviderError, type Provider } from "./types";

type Session = { accessJwt: string; did: string; handle: string };

async function login(service: string, identifier: string, password: string) {
  return api<Session>(
    `${service}/xrpc/com.atproto.server.createSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    },
    "Bluesky login",
  );
}

/** Rich-text facets (links + hashtags) with UTF-8 byte offsets, as the AT Protocol requires. */
function facets(text: string) {
  const enc = new TextEncoder();
  const byteIndex = (charIndex: number) => enc.encode(text.slice(0, charIndex)).length;
  const out: any[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)\]]+/g)) {
    const uri = m[0].replace(/[.,;:!?]+$/, "");
    const start = m.index!;
    out.push({
      index: { byteStart: byteIndex(start), byteEnd: byteIndex(start + uri.length) },
      features: [{ $type: "app.bsky.richtext.facet#link", uri }],
    });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const start = m.index! + m[1].length;
    out.push({
      index: { byteStart: byteIndex(start), byteEnd: byteIndex(start + m[2].length + 1) },
      features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }],
    });
  }
  return out;
}

export const bluesky: Provider = {
  id: "bluesky",
  name: "Bluesky",
  color: "#1185fe",
  maxChars: 300,
  maxMedia: 4,
  connect: "form",
  fields: [
    { name: "handle", label: "Handle", placeholder: "you.bsky.social", required: true },
    {
      name: "appPassword",
      label: "App password",
      type: "password",
      placeholder: "xxxx-xxxx-xxxx-xxxx",
      help: "Create one at bsky.app → Settings → Privacy and security → App passwords. Never use your main password.",
      required: true,
    },
    { name: "service", label: "PDS (optional)", type: "url", placeholder: "https://bsky.social" },
  ],
  isConfigured: () => true,

  async connectForm(values) {
    const service = (values.service || "https://bsky.social").replace(/\/$/, "");
    const handle = values.handle.replace(/^@/, "").trim();
    const session = await login(service, handle, values.appPassword.trim());
    const profile = await api(
      `${service}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`,
      { headers: { Authorization: `Bearer ${session.accessJwt}` } },
      "Bluesky profile",
    ).catch(() => ({}) as any);
    return [
      {
        externalId: session.did,
        name: profile.displayName || session.handle,
        username: session.handle,
        avatar: profile.avatar,
        profileUrl: `https://bsky.app/profile/${session.handle}`,
        secrets: { service, identifier: handle, password: values.appPassword.trim() },
      },
    ];
  },

  async publish(account, { text, media }) {
    const { service, identifier, password } = account.secrets as Record<string, string>;
    const session = await login(service, identifier, password);
    const auth = { Authorization: `Bearer ${session.accessJwt}` };

    const record: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      facets: facets(text),
    };

    const images = media.filter((m) => m.mime.startsWith("image/")).slice(0, 4);
    if (images.length) {
      const uploaded = [];
      for (const img of images) {
        if (img.size > 976_000) {
          throw new ProviderError(`Bluesky images must be under ~1MB (${img.name} is too large)`, false);
        }
        const { blob } = await api(
          `${service}/xrpc/com.atproto.repo.uploadBlob`,
          { method: "POST", headers: { ...auth, "Content-Type": img.mime }, body: await readMedia(img) },
          "Bluesky upload",
        );
        uploaded.push({ alt: "", image: blob });
      }
      record.embed = { $type: "app.bsky.embed.images", images: uploaded };
    }

    const res = await api<{ uri: string }>(
      `${service}/xrpc/com.atproto.repo.createRecord`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
      },
      "Bluesky post",
    );
    const rkey = res.uri.split("/").pop();
    return { id: res.uri, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
  },
};
