import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { PermissionError, sync } from "@/lib/services/sync";

export const dynamic = "force-dynamic";

const MAX_CHANGES = 500;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  let body: { cursor?: unknown; changes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const changes = body?.changes ?? [];
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES) {
    return NextResponse.json({ error: `changes must be an array of at most ${MAX_CHANGES}` }, { status: 400 });
  }
  try {
    const res = await sync(user, { cursor: typeof body.cursor === "string" ? body.cursor : undefined, changes }, todayIso());
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
}
