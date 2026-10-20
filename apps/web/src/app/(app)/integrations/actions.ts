"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { disconnectIntegration } from "@/lib/services/integrations";
import { connectStripe } from "@/lib/services/stripe";
import { authorizeUrl, collectPayment } from "@/lib/services/gocardless";
import { ensurePortalToken } from "@/lib/services/portal";

const msg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : "Something went wrong");

export async function connectStripeAction(f: FormData) {
  const user = await requireUser("edit_settings");
  try {
    await connectStripe(user.accountId, String(f.get("secretKey") ?? ""), (f.get("webhookSecret") as string | null) ?? null);
  } catch (e) {
    redirect(`/integrations/stripe?error=${msg(e)}`);
  }
  revalidatePath("/integrations");
  redirect("/integrations/stripe?result=connected");
}

export async function disconnectStripeAction() {
  const user = await requireUser("edit_settings");
  await disconnectIntegration(user.accountId, "stripe");
  revalidatePath("/integrations");
  redirect("/integrations");
}

export async function connectGoCardlessAction() {
  const user = await requireUser("edit_settings");
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, user.accountId) });
  let url: string;
  try {
    url = authorizeUrl(user.accountId, { email: user.email, organisationName: account?.businessName });
  } catch (e) {
    redirect(`/integrations/gocardless?error=${msg(e)}`);
  }
  redirect(url);
}

export async function disconnectGoCardlessAction() {
  const user = await requireUser("edit_settings");
  await disconnectIntegration(user.accountId, "gocardless");
  revalidatePath("/integrations");
  redirect("/integrations");
}

export async function createPortalLinkAction(customerId: string) {
  const user = await requireUser("edit_job_details");
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c || c.accountId !== user.accountId) throw new Error("Customer not found");
  await ensurePortalToken(customerId);
  revalidatePath(`/customers/${customerId}`);
}

export async function collectDirectDebitAction(customerId: string, f: FormData) {
  const user = await requireUser("enter_payments");
  const amount = Math.round(Number(f.get("amount") ?? 0) * 100);
  await collectPayment(user.accountId, customerId, amount, String(f.get("description") || "Window cleaning"));
  revalidatePath(`/customers/${customerId}`);
}
