import { readState } from "@/lib/services/hmrc";
import { qboExchangeCode } from "@/lib/services/quickbooks";
import { getUser } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getUser();
  const accountId = readState(url.searchParams.get("state") ?? "", "quickbooks");
  const code = url.searchParams.get("code"), realmId = url.searchParams.get("realmId");
  if (!user || !(user.isOwner || user.permissions.has("edit_settings")) || !accountId || accountId !== user.accountId || !code || !realmId) return new Response("Invalid QuickBooks authorisation response", { status: 400 });
  await qboExchangeCode(accountId, code, realmId);
  return Response.redirect(new URL("/integrations?connected=quickbooks", url), 302);
}
