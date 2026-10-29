import { saveConnectedAccounts } from "@/lib/accounts";
import { appUrl, currentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { getProvider } from "@/lib/providers";

function back(params: Record<string, string>) {
  return Response.redirect(`${appUrl()}/?${new URLSearchParams({ tab: "accounts", ...params })}`, 302);
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const providerId = (await params).provider;
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  const user = await currentUser();
  if (!user) return Response.redirect(`${appUrl()}/login`, 302);

  // Single use: the state row is consumed whether or not the exchange succeeds.
  const row = state
    ? await one<{ user_id: string; provider: string; verifier: string; extra: string }>(
        "DELETE FROM oauth_states WHERE state = ? RETURNING user_id, provider, verifier, extra",
        [state],
      )
    : undefined;

  if (denied) return back({ error: `Connection cancelled: ${denied}` });
  if (!row || row.user_id !== user.id || row.provider !== providerId || !code) {
    return back({ error: "This connection link expired or is invalid. Please try again." });
  }

  try {
    const provider = getProvider(providerId);
    const accounts = await provider.finishOAuth!({
      code,
      redirectUri: `${appUrl()}/api/oauth/callback/${providerId}`,
      verifier: row.verifier,
      extra: JSON.parse(row.extra),
    });
    if (!accounts.length) return back({ error: `No ${provider.name} accounts were found to connect.` });
    await saveConnectedAccounts(user.id, providerId, accounts);
    return back({ connected: `${accounts.length} ${provider.name} account${accounts.length > 1 ? "s" : ""}` });
  } catch (err) {
    console.error(err);
    return back({ error: (err as Error).message });
  }
}
