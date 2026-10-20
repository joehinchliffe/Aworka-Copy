import { valuation } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { PrintButton } from "../PrintButton";

export default async function ValuationPage({ searchParams }: { searchParams: Promise<{ asAt?: string }> }) {
  const user = await requireUser("view_reports");
  const sp = await searchParams;
  const asAt = sp.asAt && /^\d{4}-\d{2}-\d{2}$/.test(sp.asAt) ? sp.asAt : todayIso();
  const v = await valuation(user.accountId, asAt);
  return (
    <>
      <div className="spread"><h1>Round valuation</h1><PrintButton /></div>
      <p className="muted">Yearly value of active regular work as at {formatDate(asAt)}: each job&apos;s price times its visits per year.</p>
      <form className="row no-print" style={{ marginBottom: 12 }}>
        <label htmlFor="asAt">As at</label>
        <input id="asAt" type="date" name="asAt" defaultValue={asAt} style={{ width: 170 }} />
        <button className="btn">Show</button>
      </form>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Yearly value</div><div className="value">{money(v.total.annualValue)}</div></div>
        <div className="stat"><div className="label">Monthly average</div><div className="value">{money(Math.round(v.total.annualValue / 12))}</div></div>
        <div className="stat"><div className="label">Customers</div><div className="value">{v.total.customers}</div></div>
        <div className="stat"><div className="label">Regular jobs</div><div className="value">{v.total.jobs}</div></div>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Round</th><th className="num">Customers</th><th className="num">Jobs</th><th className="num">Per month</th><th className="num">Per year</th></tr></thead>
        <tbody>
          {v.rows.map((r) => (
            <tr key={r.roundId ?? "none"}>
              <td>{r.name}</td><td className="num">{r.customers}</td><td className="num">{r.jobs}</td>
              <td className="num">{money(Math.round(r.annualValue / 12))}</td><td className="num">{money(r.annualValue)}</td>
            </tr>
          ))}
          {v.rows.length === 0 && <tr><td colSpan={5} className="muted">No active regular jobs.</td></tr>}
        </tbody>
        <tfoot><tr><th>Total</th><th className="num">{v.total.customers}</th><th className="num">{v.total.jobs}</th><th className="num">{money(Math.round(v.total.annualValue / 12))}</th><th className="num">{money(v.total.annualValue)}</th></tr></tfoot>
      </table></div>
    </>
  );
}
