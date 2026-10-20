import Link from "next/link";
import { agedDebts } from "@/lib/services/debts";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";

export default async function AgedDebtsPage({ searchParams }: { searchParams: Promise<{ asAt?: string }> }) {
  const user = await requireUser("access_debt_list");
  const asAt = (await searchParams).asAt ?? todayIso();
  const { lines, buckets } = await agedDebts(user.accountId, asAt);
  return (
    <>
      <h1>Aged debts</h1>
      <form className="row no-print" style={{ marginBottom: 12 }}><label>As at</label><input type="date" name="asAt" defaultValue={asAt} style={{ width: 170 }} /><button className="btn">Refresh</button></form>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Under 30 days</div><div className="value">{money(buckets.current)}</div></div>
        <div className="stat"><div className="label">30–59 days</div><div className="value">{money(buckets.d30)}</div></div>
        <div className="stat"><div className="label">60–89 days</div><div className="value">{money(buckets.d60)}</div></div>
        <div className="stat"><div className="label">90+ days</div><div className="value debt">{money(buckets.d90)}</div></div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Customer</th><th>Since</th><th className="num">Days</th><th className="num">Owed</th></tr></thead>
        <tbody>{lines.map((l) => (
          <tr key={l.customer.id}><td><Link href={`/customers/${l.customer.id}`}>{l.name}</Link></td><td>{formatDate(l.customer.debtSince)}</td><td className="num">{l.days}</td><td className="num debt">{money(-l.customer.balance)}</td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
