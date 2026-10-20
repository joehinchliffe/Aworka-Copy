import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { requireUser } from "@/lib/session";
import { emailInvoiceAction } from "../../debts/actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const row = (await db.select({ invoice: schema.invoices, contact: schema.contacts, account: schema.accounts })
    .from(schema.invoices)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.invoices.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customers.contactId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.invoices.accountId))
    .where(and(eq(schema.invoices.id, id), eq(schema.invoices.accountId, user.accountId))).limit(1))[0];
  if (!row) notFound();
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 12 }}>
        <Link className="btn" href={`/customers/${row.invoice.customerId}`}>Back to customer</Link>
        {row.contact.email && <form action={emailInvoiceAction.bind(null, id)}><button className="btn primary">{row.invoice.emailedAt ? "Email again" : "Email to customer"}</button></form>}
        <Link className="btn" href={`/v/${row.invoice.viewToken}`} target="_blank">Customer view</Link>
        <span className="small muted">Print with Ctrl+P</span>
      </div>
      <InvoiceDocument {...row} />
    </>
  );
}
