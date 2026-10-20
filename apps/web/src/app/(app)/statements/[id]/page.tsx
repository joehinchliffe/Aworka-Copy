import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/services/customers";
import { statement } from "@/lib/services/debts";
import { contactName } from "@/lib/services/ledger";
import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const today = todayIso();
  const [s, c, account] = await Promise.all([statement(user.accountId, id, today), getCustomer(user.accountId, id), accountFor(user.accountId)]);
  if (!s || !c || !account) notFound();
  return (
    <main>
      <div className="no-print row" style={{ marginBottom: 12 }}><Link className="btn" href={`/customers/${id}`}>Back</Link><span className="small muted">Print with Ctrl+P</span></div>
      <article className="panel" style={{ maxWidth: 820, margin: "0 auto" }}>
        <div className="spread"><h1>{account.businessName}</h1><h2>Statement · {formatDate(today)}</h2></div>
        <p style={{ whiteSpace: "pre-line" }}><strong>{contactName(c.contact)}</strong>{"\n"}{c.contact.address}</p>
        <table>
          <thead><tr><th>Date</th><th>Details</th><th className="num">Amount</th><th className="num">Balance</th></tr></thead>
          <tbody>
            <tr><td></td><td>Opening balance</td><td></td><td className="num">{money(s.opening)}</td></tr>
            {s.lines.map((l, i) => <tr key={i}><td>{formatDate(l.date)}</td><td>{l.text}</td><td className="num">{money(l.amount)}</td><td className="num">{money(l.balance)}</td></tr>)}
          </tbody>
          <tfoot><tr><th colSpan={3}>{s.closing < 0 ? "Amount due" : "Balance"}</th><th className="num">{money(Math.abs(s.closing))}</th></tr></tfoot>
        </table>
      </article>
    </main>
  );
}
