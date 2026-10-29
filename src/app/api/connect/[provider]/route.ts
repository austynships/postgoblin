import { saveConnectedAccounts } from "@/lib/accounts";
import { HttpError, appUrl, handler, requireUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { db, now } from "@/lib/db";
import { getProvider } from "@/lib/providers";

/**
 * Form providers: validates credentials and saves the account.
 * OAuth providers: stores state + PKCE verifier and returns the authorize URL.
 */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const user = await requireUser();
  const provider = getProvider((await params).provider);
  const { values = {} } = (await req.json().catch(() => ({}))) as { values?: Record<string, string> };

  for (const f of provider.fields ?? []) {
    if (f.required && !values[f.name]?.trim()) throw new HttpError(400, `${f.label} is required`);
  }

  if (provider.connect === "form") {
    const accounts = await provider.connectForm!(values);
    saveConnectedAccounts(user.id, provider.id, accounts);
    return Response.json({ connected: accounts.length });
  }

  if (!provider.isConfigured()) throw new HttpError(400, provider.setupHint ?? `${provider.name} isn't configured`);
  const state = randomToken(24);
  const verifier = randomToken(48);
  const extra = { ...values };
  const redirectUri = `${appUrl()}/api/oauth/callback/${provider.id}`;
  const url = await provider.startOAuth!({ state, redirectUri, verifier, extra });
  db.prepare(
    "INSERT INTO oauth_states (state, user_id, provider, verifier, extra, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(state, user.id, provider.id, verifier, JSON.stringify(extra), now());
  return Response.json({ redirect: url });
});
