import { runNightly } from "@/lib/services/nightly";
import { todayIso } from "@/lib/time";

/** Called by a scheduler once a night with header x-cron-secret. */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await runNightly(todayIso()));
}
