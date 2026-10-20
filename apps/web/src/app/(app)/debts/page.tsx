import Link from "next/link";
import { listDebts, type DebtFilter } from "@/lib/services/debts";
import { requireUser } from "@/lib/session";
import { balanceLabel, money, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatDate } from "@/lib/time";

export default async function DebtsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("access_debt_list");
  const sp = await searchParams;
  const f: DebtFilter = { method: sp.method || undefined, kind: (sp.kind as DebtFilter["kind"]) ?? "debts", sort: (sp.sort as DebtFilter["sort"]) ?? "debt_since", search: sp.q };
  const rows = await listDebts(user.accountId, f);
  const total = rows.reduce((s, r) => s + r.customer.balance, 0);
  return (
    <>
      <div className="spread"><h1>Debts</h1><button className="btn no-print" form="print" type="button">Print with Ctrl+P</button></div>
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <input name="q" defaultValue={sp.q} placeholder="Search" style={{ maxWidth: 220 }} />
        <select name="method" defaultValue={sp.method ?? ""} style={{ maxWidth: 170 }}>
          <option value="">All payment methods</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="kind" defaultValue={f.kind} style={{ maxWidth: 170 }}>
          <option value="debts">Debts</option><option value="credits">Credits</option><option value="debts_and_credits">Debts and credits</option><option value="zero">Zero balances</option>
        </select>
        <select name="sort" defaultValue={f.sort} style={{ maxWidth: 150 }}>
          <option value="debt_since">Oldest first</option><option value="balance">Largest first</option>
        </select>
        <button className="btn">Refresh</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Address</th><th>Pays</th><th>In debt since</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const b = balanceLabel(r.customer.balance);
              return (
                <tr key={r.customer.id}>
                  <td><Link href={`/customers/${r.customer.id}`}>{r.name}</Link></td>
                  <td>{r.contact.address?.split("\n")[0]}</td>
                  <td>{PAYMENT_METHOD_LABELS[r.customer.paymentMethod]}</td>
                  <td>{formatDate(r.customer.debtSince)}</td>
                  <td className={`num ${b.cls}`}>{b.text}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Nothing to show.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={4}>Total ({rows.length})</th><th className="num">{money(-total)}</th></tr></tfoot>
        </table>
      </div>
    </>
  );
}
