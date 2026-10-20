import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { PayInvoiceOnline } from "@/components/PayInvoiceOnline";

/** Public, unauthenticated invoice view reached from the emailed link. */
export default async function PublicInvoice({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const row = (await db.select({ invoice: schema.invoices, contact: schema.contacts, account: schema.accounts })
    .from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.invoices.accountId))
    .where(eq(schema.invoices.viewToken, token)).limit(1))[0];
  if (!row) notFound();
  return (
    <main>
      {error === "card" && <div className="notice error no-print" style={{ maxWidth: 820, margin: "0 auto 12px" }}>Card payment isn&apos;t available right now. Please try again later.</div>}
      <PayInvoiceOnline invoice={row.invoice} />
      <InvoiceDocument {...row} />
    </main>
  );
}
