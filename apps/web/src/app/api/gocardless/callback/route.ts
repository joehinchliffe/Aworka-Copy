import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { appUrl } from "@/lib/services/integrations";
import { completeConnect, verifyState } from "@/lib/services/gocardless";

/** OAuth redirect back from GoCardless Connect. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (result: string) => NextResponse.redirect(`${appUrl()}/integrations/gocardless?result=${result}`);
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);
  if (url.searchParams.get("error")) return back("cancelled");
  const accountId = verifyState(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!accountId || accountId !== user.accountId || !code) return back("invalid");
  if (!user.permissions.has("edit_settings") && !user.permissions.has("administrator")) return back("forbidden");
  try {
    await completeConnect(accountId, code);
  } catch {
    return back("failed");
  }
  return back("connected");
}
