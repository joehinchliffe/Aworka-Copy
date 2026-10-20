"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appUrl } from "@/lib/services/integrations";
import { confirmAppointment, customerByPortalToken, ensurePortalToken } from "@/lib/services/portal";
import { createCheckoutSession, STRIPE_MIN_PENCE } from "@/lib/services/stripe";
import { createMandateSetupLink } from "@/lib/services/gocardless";
import { formatPence } from "@rounds/domain";

/** Public (no login) actions for the customer portal and online invoice. Authorised by the secret token. */

export async function confirmAppointmentAction(token: string, jobId: string) {
  await confirmAppointment(token, jobId);
  revalidatePath(`/p/${token}`);
}

export async function payBalanceAction(token: string) {
  const row = await customerByPortalToken(token);
  if (!row) redirect("/");
  const owed = -row.customer.balance;
  if (owed < STRIPE_MIN_PENCE) redirect(`/p/${token}`);
  let url: string;
  try {
    const s = await createCheckoutSession(row.account.id, row.customer.id, owed, `${row.account.businessName}: balance of ${formatPence(owed)}`,
      `${appUrl()}/p/${token}/paid?session_id={CHECKOUT_SESSION_ID}`, `${appUrl()}/p/${token}`, { email: row.contact.email });
    url = s.url;
  } catch {
    redirect(`/p/${token}?error=card`);
  }
  redirect(url);
}

export async function payInvoiceAction(viewToken: string) {
  const row = (await db.select({ invoice: schema.invoices, customer: schema.customers, contact: schema.contacts, account: schema.accounts })
    .from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.invoices.accountId))
    .where(eq(schema.invoices.viewToken, viewToken)).limit(1))[0];
  if (!row) redirect("/");
  const amount = Math.min(row.invoice.amountToPay, Math.max(0, -row.customer.balance));
  if (row.invoice.paidAt || amount < STRIPE_MIN_PENCE) redirect(`/v/${viewToken}`);
  const portal = await ensurePortalToken(row.customer.id);
  let url: string;
  try {
    const s = await createCheckoutSession(row.account.id, row.customer.id, amount, `${row.account.businessName}: invoice ${row.invoice.number}`,
      `${appUrl()}/p/${portal}/paid?session_id={CHECKOUT_SESSION_ID}`, `${appUrl()}/v/${viewToken}`,
      { invoiceId: row.invoice.id, email: row.contact.email });
    url = s.url;
  } catch {
    redirect(`/v/${viewToken}?error=card`);
  }
  redirect(url);
}

export async function setUpDirectDebitAction(token: string) {
  const row = await customerByPortalToken(token);
  if (!row) redirect("/");
  let url: string;
  try {
    url = await createMandateSetupLink(row.account.id, row.customer.id, `${appUrl()}/p/${token}?dd=done`, `${appUrl()}/p/${token}`);
  } catch {
    redirect(`/p/${token}?error=dd`);
  }
  redirect(url);
}
