import { handleStripeWebhook } from "@/lib/services/stripe";

/** Stripe webhook endpoint for one business's own Stripe account. */
export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return new Response("Not found", { status: 404 });
  const raw = await req.text();
  const r = await handleStripeWebhook(accountId, raw, req.headers.get("stripe-signature"));
  return new Response(r.body, { status: r.status });
}
