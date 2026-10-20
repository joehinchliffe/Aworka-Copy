import { applyBillingEvent, verifyStripeSignature } from "@/lib/services/billing";

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
  if (!secret || !verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) return new Response("Bad signature", { status: 400 });
  await applyBillingEvent(JSON.parse(raw));
  return new Response("ok");
}
