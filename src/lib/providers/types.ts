export type ProviderId =
  | "x"
  | "bluesky"
  | "mastodon"
  | "linkedin"
  | "threads"
  | "facebook"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "discord"
  | "telegram";

export type FormField = {
  name: string;
  label: string;
  type?: "text" | "password" | "url";
  placeholder?: string;
  help?: string;
  required?: boolean;
};

/** Account data returned when a user connects a profile/page/channel. */
export type ConnectedAccount = {
  externalId: string;
  name: string;
  username?: string;
  avatar?: string;
  profileUrl?: string;
  expiresAt?: number | null;
  /** Everything needed to publish later. Stored encrypted. */
  secrets: Record<string, unknown>;
};

export type MediaFile = {
  id: string;
  /** Absolute URL (Vercel Blob, or {APP_URL}/api/media/… for local files). */
  url: string;
  /** Set when the file lives on local disk (development without Blob). */
  localPath?: string;
  mime: string;
  name: string;
  size: number;
};

export type PublishInput = { text: string; media: MediaFile[] };
export type PublishResult = { id: string; url?: string };

/** An account as handed to a provider at publish time. */
export type AccountContext = {
  id: string;
  externalId: string;
  name: string;
  username?: string | null;
  expiresAt?: number | null;
  secrets: Record<string, unknown>;
};

export type OAuthStartContext = {
  state: string;
  redirectUri: string;
  verifier: string;
  extra: Record<string, string>;
};

export type OAuthCallbackContext = {
  code: string;
  redirectUri: string;
  verifier: string;
  extra: Record<string, string>;
};

export interface Provider {
  id: ProviderId;
  name: string;
  color: string;
  maxChars: number;
  maxMedia: number;
  /**
   * Media the platform insists on: "any" = at least one photo or video
   * (Instagram), "video" = exactly one video (YouTube, TikTok).
   */
  requiresMedia?: "any" | "video";
  /** How the user connects: OAuth redirect, or a credentials form. */
  connect: "oauth" | "form";
  /** Fields collected before connecting (forms, or pre-OAuth like a Mastodon instance). */
  fields?: FormField[];
  /** For OAuth providers: are the app's client credentials configured? */
  isConfigured(): boolean;
  setupHint?: string;
  startOAuth?(ctx: OAuthStartContext): Promise<string>;
  finishOAuth?(ctx: OAuthCallbackContext): Promise<ConnectedAccount[]>;
  connectForm?(values: Record<string, string>): Promise<ConnectedAccount[]>;
  /** Return refreshed secrets/expiry when the token is close to expiring. */
  refresh?(account: AccountContext): Promise<{ secrets: Record<string, unknown>; expiresAt?: number | null } | null>;
  publish(account: AccountContext, input: PublishInput): Promise<PublishResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** false = don't retry (e.g. revoked token, validation error). */
    public retryable = true,
  ) {
    super(message);
  }
}
