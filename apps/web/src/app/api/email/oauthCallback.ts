import { exchangeEmailCode, readEmailOAuthState, type OAuthEmailProvider } from "@/lib/services/email";
import { getUser } from "@/lib/session";

/** Shared OAuth callback for Gmail and Outlook sending: the signed state must name the logged-in account. */
export async function emailOAuthCallback(req: Request, provider: OAuthEmailProvider) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/integrations/email?${q}`, url), 302);
  const user = await getUser();
  const accountId = readEmailOAuthState(url.searchParams.get("state") ?? "", provider);
  if (!user || !accountId || accountId !== user.accountId) return new Response("Invalid authorisation response", { status: 400 });
  if (!user.permissions.has("edit_settings") && !user.permissions.has("administrator")) return new Response("Not allowed", { status: 403 });
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Access was not granted. Please try again.")}`);
  const code = url.searchParams.get("code");
  if (!code) return new Response("Invalid authorisation response", { status: 400 });
  try {
    await exchangeEmailCode(accountId, provider, code);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Could not connect")}`);
  }
  return back(`connected=${provider}`);
}
