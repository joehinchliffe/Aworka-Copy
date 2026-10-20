import { emailOAuthCallback } from "../../oauthCallback";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return emailOAuthCallback(req, "gmail");
}
