import { listAccounts } from "@/lib/accounts";
import { handler, requireUser } from "@/lib/auth";

export const GET = handler(async () => {
  const user = await requireUser();
  return Response.json({ accounts: listAccounts(user.id) });
});
