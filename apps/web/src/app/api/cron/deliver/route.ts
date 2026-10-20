import { timingSafeEqual } from "node:crypto";
import { deliverAllQueued } from "@/lib/services/transports";

export const dynamic = "force-dynamic";

function authorised(given: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Deliver queued email and SMS for all accounts. Called by the scheduler with x-cron-secret. */
export async function POST(req: Request) {
  if (!authorised(req.headers.get("x-cron-secret"))) {
    return Response.json({ error: "Unauthorised" }, { status: 401 });
  }
  const result = await deliverAllQueued();
  return Response.json(result);
}
