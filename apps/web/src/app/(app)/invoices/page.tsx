import Link from "next/link";
import { listInvoices } from "@/lib/services/debts";
import { contactName } from "@/lib/services/ledger";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";

export default async function InvoicesPage() {
  const user = await requireUser();
  const rows = await listInvoices(user.accountId);
  return (
    <>
      <h1>Invoices</h1>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Number</th><th>Customer</th><th className="num">Net</th><th className="num">Total</th><th>Emailed</th><th>Due</th></tr></thead>
        <tbody>
          {rows.map(({ invoice, contact }) => (
            <tr key={invoice.id}>
              <td>{formatDate(invoice.issuedOn)}</td><td><Link href={`/invoices/${invoice.id}`}>{invoice.number}</Link></td>
              <td>{contactName(contact)}</td><td className="num">{money(invoice.net)}</td><td className="num">{money(invoice.gross)}</td>
              <td>{invoice.emailedAt ? "Yes" : ""}</td><td>{formatDate(invoice.dueOn)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No invoices yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
