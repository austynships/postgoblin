import { HttpError } from "./auth";
import { decrypt, encrypt, id } from "./crypto";
import { all, now, one, run, tx } from "./db";
import { getProvider } from "./providers";
import type { AccountContext, ConnectedAccount } from "./providers/types";

type AccountRow = {
  id: string;
  user_id: string;
  provider: string;
  external_id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  profile_url: string | null;
  secrets: string;
  expires_at: number | null;
  status: string;
  last_error: string | null;
  created_at: number;
};

export type AccountView = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  username: string | null;
  avatar: string | null;
  profileUrl: string | null;
  status: string;
  lastError: string | null;
  expiresAt: number | null;
};

function view(r: AccountRow): AccountView {
  let providerName = r.provider;
  try {
    providerName = getProvider(r.provider).name;
  } catch {}
  return {
    id: r.id,
    provider: r.provider,
    providerName,
    name: r.name,
    username: r.username,
    avatar: r.avatar,
    profileUrl: r.profile_url,
    status: r.status,
    lastError: r.last_error,
    expiresAt: r.expires_at,
  };
}

export async function listAccounts(userId: string): Promise<AccountView[]> {
  const rows = await all<AccountRow>("SELECT * FROM accounts WHERE user_id = ? ORDER BY provider, name", [userId]);
  return rows.map(view);
}

export async function getAccountsByIds(userId: string, ids: string[]): Promise<AccountView[]> {
  const byId = new Map((await listAccounts(userId)).map((a) => [a.id, a]));
  return ids.map((i) => {
    const a = byId.get(i);
    if (!a) throw new HttpError(400, `Unknown account id ${i}`);
    return a;
  });
}

/** Insert or update (on reconnect) accounts returned by a provider. */
export async function saveConnectedAccounts(userId: string, provider: string, accounts: ConnectedAccount[]) {
  await tx(
    accounts.map((a) => [
      `INSERT INTO accounts (id, user_id, provider, external_id, name, username, avatar, profile_url, secrets, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
       ON CONFLICT (user_id, provider, external_id) DO UPDATE SET
         name = excluded.name, username = excluded.username, avatar = excluded.avatar,
         profile_url = excluded.profile_url, secrets = excluded.secrets, expires_at = excluded.expires_at,
         status = 'active', last_error = NULL`,
      [
        id("acc_"),
        userId,
        provider,
        a.externalId,
        a.name,
        a.username ?? null,
        a.avatar ?? null,
        a.profileUrl ?? null,
        encrypt(a.secrets),
        a.expiresAt ?? null,
        now(),
      ],
    ]),
  );
  return accounts.length;
}

export async function deleteAccount(userId: string, accountId: string) {
  const row = await one("DELETE FROM accounts WHERE id = ? AND user_id = ? RETURNING id", [accountId, userId]);
  if (!row) throw new HttpError(404, "Account not found");
}

/** Server-only: account with decrypted secrets, for publishing. */
export async function loadAccountContext(
  accountId: string,
): Promise<(AccountContext & { provider: string; status: string }) | null> {
  const r = await one<AccountRow>("SELECT * FROM accounts WHERE id = ?", [accountId]);
  if (!r) return null;
  return {
    id: r.id,
    provider: r.provider,
    status: r.status,
    externalId: r.external_id,
    name: r.name,
    username: r.username,
    expiresAt: r.expires_at,
    secrets: decrypt(r.secrets),
  };
}

export async function updateAccountSecrets(accountId: string, secrets: Record<string, unknown>, expiresAt?: number | null) {
  await run("UPDATE accounts SET secrets = ?, expires_at = ? WHERE id = ?", [encrypt(secrets), expiresAt ?? null, accountId]);
}

export async function markAccount(accountId: string, status: "active" | "error", error?: string) {
  await run("UPDATE accounts SET status = ?, last_error = ? WHERE id = ?", [status, error ?? null, accountId]);
}
