"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { recordPayment } from "@/lib/services/debts";
import { createInvoice, emailInvoice } from "@/lib/services/invoicing";

export async function recordPaymentAction(customerId: string, f: FormData) {
  const user = await requireUser("enter_payments");
  const paid = Math.round(Number(f.get("amount") ?? 0) * 100);
  if (!paid) return;
  await recordPayment(user.accountId, user.id, customerId, { paid, method: String(f.get("method") ?? "cash"), reference: (f.get("reference") as string) || null, date: todayIso() });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/debts");
}

export async function createInvoiceAction(customerId: string) {
  const user = await requireUser("send_invoices");
  const inv = await createInvoice(user.accountId, customerId, todayIso(), { userId: user.id });
  revalidatePath(`/customers/${customerId}`);
  if (inv) redirect(`/invoices/${inv.id}`);
}

export async function emailInvoiceAction(invoiceId: string) {
  const user = await requireUser("send_invoices");
  await emailInvoice(user.accountId, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
}
