import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money } from "@/lib/format";
import { stripeConnected, STRIPE_MIN_PENCE } from "@/lib/services/stripe";
import { payInvoiceAction } from "@/app/p/actions";

/** "Pay online" button for the public invoice page, shown when the business takes cards. */
export async function PayInvoiceOnline({ invoice }: { invoice: { viewToken: string; customerId: string; accountId: string; amountToPay: number; paidAt: Date | null } }) {
  if (invoice.paidAt || !(await stripeConnected(invoice.accountId))) return null;
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, invoice.customerId) });
  const amount = Math.min(invoice.amountToPay, Math.max(0, -(c?.balance ?? 0)));
  if (amount < STRIPE_MIN_PENCE) return null;
  return (
    <form action={payInvoiceAction.bind(null, invoice.viewToken)} className="no-print" style={{ maxWidth: 820, margin: "12px auto", textAlign: "right" }}>
      <button className="btn primary">Pay {money(amount)} online by card</button>
    </form>
  );
}
