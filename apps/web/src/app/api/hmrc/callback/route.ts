import { exchangeCode, readState } from "@/lib/services/hmrc";
import { getUser } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getUser();
  const accountId = readState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!user || !accountId || accountId !== user.accountId || !code) return new Response("Invalid HMRC authorisation response", { status: 400 });
  await exchangeCode(accountId, code);
  return Response.redirect(new URL("/tax?connected=hmrc", url), 302);
}
