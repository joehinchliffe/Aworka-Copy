import { handleGoCardlessWebhook } from "@/lib/services/gocardless";

/** Single partner webhook endpoint for every connected GoCardless merchant. */
export async function POST(req: Request) {
  const raw = await req.text();
  const r = await handleGoCardlessWebhook(raw, req.headers.get("webhook-signature"));
  return new Response(r.body, { status: r.status });
}
