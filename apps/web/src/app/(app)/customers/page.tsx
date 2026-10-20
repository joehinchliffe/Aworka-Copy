import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { listCustomers } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";
import { balanceLabel, frequencyLabel, money, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { firstAddressLine, contactName } from "@/lib/services/ledger";
import { formatDate } from "@/lib/time";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show = (sp.show as "all" | "debts" | "suspended") ?? "all";
  const rows = await listCustomers(user.accountId, { search: sp.q, show, roundId: sp.round || undefined });
  const rounds = await db.select().from(schema.rounds).where(eq(schema.rounds.accountId, user.accountId)).orderBy(schema.rounds.name);
  const canSeePrices = user.permissions.has("show_account_customer_prices");
  return (
    <>
      <div className="spread">
        <h1>Jobs</h1>
        <div className="row no-print">
          <Link className="btn" href="/customers/export">Export CSV</Link>
          <Link className="btn" href="/customers/import">Import</Link>
          <Link className="btn primary" href="/customers/new">New customer</Link>
        </div>
      </div>
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={sp.q} placeholder="Search name, address, postcode or reference" style={{ maxWidth: 360 }} />
        <select name="show" defaultValue={show} style={{ maxWidth: 160 }}>
          <option value="all">All</option>
          <option value="debts">Debts</option>
          <option value="suspended">Suspended</option>
        </select>
        <select name="round" defaultValue={sp.round ?? ""} style={{ maxWidth: 200 }}>
          <option value="">All rounds</option>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button className="btn">Filter</button>
      </form>
      {rows.length === 0 ? (
        <div className="panel">
          <h2>No customers yet</h2>
          <p>Add your first customer and their job, or import a spreadsheet.</p>
          <Link className="btn primary" href="/customers/new">New customer</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Job</th><th>Customer</th><th>Round</th><th>Frequency</th><th className="num">Price</th><th>Next due</th><th>Pays</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {rows.map(({ customer, contact, specs }) => {
                const b = balanceLabel(customer.balance);
                const s0 = specs[0];
                const showPrice = canSeePrices || !["email_invoice", "paper_invoice"].includes(customer.paymentMethod);
                return (
                  <tr key={customer.id}>
                    <td><Link href={`/customers/${customer.id}`}>{[firstAddressLine(contact), s0?.spec.reference].filter(Boolean).join(" ") || contactName(contact)}</Link>
                      {specs.length > 1 && <span className="small muted"> +{specs.length - 1} more</span>}
                      {s0?.spec.status === "suspended" && <span className="badge warn"> suspended</span>}
                      {s0?.spec.status === "estimate" && <span className="badge info"> estimate</span>}</td>
                    <td>{contactName(contact)}</td>
                    <td>{s0?.round?.name ?? ""}</td>
                    <td>{s0 ? frequencyLabel(s0.spec) : ""}</td>
                    <td className="num">{s0 && showPrice ? money(s0.spec.price) : ""}</td>
                    <td>{formatDate(s0?.spec.nextDueOn)}</td>
                    <td>{PAYMENT_METHOD_LABELS[customer.paymentMethod]}</td>
                    <td className={`num ${b.cls}`}>{b.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
