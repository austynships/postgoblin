import { HttpError } from "./auth";
import { decrypt, encrypt, id } from "./crypto";
import { db, now } from "./db";
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

export function listAccounts(userId: string): AccountView[] {
  const rows = db
    .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY provider, name")
    .all(userId) as AccountRow[];
  return rows.map(view);
}

export function getAccountsByIds(userId: string, ids: string[]): AccountView[] {
  const all = new Map(listAccounts(userId).map((a) => [a.id, a]));
  return ids.map((i) => {
    const a = all.get(i);
    if (!a) throw new HttpError(400, `Unknown account id ${i}`);
    return a;
  });
}

/** Insert or update (on reconnect) accounts returned by a provider. */
export function saveConnectedAccounts(userId: string, provider: string, accounts: ConnectedAccount[]) {
  const stmt = db.prepare(`
    INSERT INTO accounts (id, user_id, provider, external_id, name, username, avatar, profile_url, secrets, expires_at, status, created_at)
    VALUES (@id, @userId, @provider, @externalId, @name, @username, @avatar, @profileUrl, @secrets, @expiresAt, 'active', @createdAt)
    ON CONFLICT(user_id, provider, external_id) DO UPDATE SET
      name = excluded.name, username = excluded.username, avatar = excluded.avatar,
      profile_url = excluded.profile_url, secrets = excluded.secrets, expires_at = excluded.expires_at,
      status = 'active', last_error = NULL
  `);
  db.transaction(() => {
    for (const a of accounts) {
      stmt.run({
        id: id("acc_"),
        userId,
        provider,
        externalId: a.externalId,
        name: a.name,
        username: a.username ?? null,
        avatar: a.avatar ?? null,
        profileUrl: a.profileUrl ?? null,
        secrets: encrypt(a.secrets),
        expiresAt: a.expiresAt ?? null,
        createdAt: now(),
      });
    }
  })();
  return accounts.length;
}

export function deleteAccount(userId: string, accountId: string) {
  const res = db.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?").run(accountId, userId);
  if (!res.changes) throw new HttpError(404, "Account not found");
}

/** Server-only: account with decrypted secrets, for publishing. */
export function loadAccountContext(accountId: string): (AccountContext & { provider: string; status: string }) | null {
  const r = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as AccountRow | undefined;
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

export function updateAccountSecrets(accountId: string, secrets: Record<string, unknown>, expiresAt?: number | null) {
  db.prepare("UPDATE accounts SET secrets = ?, expires_at = ? WHERE id = ?").run(
    encrypt(secrets),
    expiresAt ?? null,
    accountId,
  );
}

export function markAccount(accountId: string, status: "active" | "error", error?: string) {
  db.prepare("UPDATE accounts SET status = ?, last_error = ? WHERE id = ?").run(status, error ?? null, accountId);
}
