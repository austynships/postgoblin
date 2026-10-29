import { bluesky } from "./bluesky";
import { discord } from "./discord";
import { facebook } from "./facebook";
import { linkedin } from "./linkedin";
import { mastodon } from "./mastodon";
import { telegram } from "./telegram";
import { threads } from "./threads";
import type { Provider, ProviderId } from "./types";
import { x } from "./x";

export const providers: Record<ProviderId, Provider> = {
  x,
  bluesky,
  mastodon,
  linkedin,
  threads,
  facebook,
  discord,
  telegram,
};

export function getProvider(id: string): Provider {
  const p = providers[id as ProviderId];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

/** Public, serializable metadata for the UI. */
export function providerCatalog() {
  return Object.values(providers).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    maxChars: p.maxChars,
    maxMedia: p.maxMedia,
    connect: p.connect,
    fields: p.fields ?? [],
    configured: p.isConfigured(),
    setupHint: p.setupHint,
  }));
}

export type ProviderInfo = ReturnType<typeof providerCatalog>[number];
