import { timingSafeEqual } from "node:crypto";
import { runNightly } from "@/lib/services/nightly";
import { todayIso } from "@/lib/time";

/** Called by a scheduler once a night with header x-cron-secret. */
export async function POST(req: Request) {
  const given = Buffer.from(req.headers.get("x-cron-secret") ?? ""), secret = Buffer.from(process.env.CRON_SECRET ?? "");
  if (!secret.length || given.length !== secret.length || !timingSafeEqual(given, secret)) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await runNightly(todayIso()));
}
