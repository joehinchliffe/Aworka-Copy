"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { startSubscription } from "@/lib/services/billing";
import type { PlanId } from "@/lib/plans";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";

export async function choosePlanAction(plan: PlanId, f: FormData) {
  const user = await requireUser("edit_settings");
  if (!user.isOwner) throw new Error("Only the account owner can change the plan");
  const [{ n } = { n: 1 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.accountId, user.accountId)));
  const url = await startSubscription(user.accountId, user.email, plan, f.get("cycle") === "yearly" ? "yearly" : "monthly", Math.max(0, n - 2));
  revalidatePath("/", "layout");
  if (url) redirect(url);
  redirect("/subscription?done=1");
}
