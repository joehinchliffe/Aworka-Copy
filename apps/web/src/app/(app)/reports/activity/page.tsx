import Link from "next/link";
import { can } from "@rounds/domain";
import { ACTIVITY_CATEGORIES, activity } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { PrintButton } from "../PrintButton";
import { activityParams } from "../params";

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("view_reports");
  const sp = await searchParams;
  const today = todayIso();
  const f = activityParams(sp, today);
  const { period, rows, total, subcategories } = await activity(user.accountId, f, today);
  const subs = subcategories.filter((s) => !f.category || s.category === f.category);
  const exportQs = new URLSearchParams(Object.entries({
    type: "activity", category: f.category, sub: f.subcategory, q: f.search, num: String(f.num), unit: f.unit, mode: f.mode, date: f.date,
  }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <>
      <div className="spread">
        <h1>Activity</h1>
        <div className="row no-print">
          {can(user.permissions, "export_reports") && <a className="btn" href={`/reports/export?${exportQs}`}>Download CSV</a>}
          <PrintButton />
        </div>
      </div>
      <p className="muted">{formatDate(period.start)} to {formatDate(period.end)}{f.category ? ` · ${ACTIVITY_CATEGORIES[f.category] ?? f.category}` : ""}</p>

      <form className="panel row no-print report-filters">
        <div>
          <label htmlFor="category">Type</label>
          <select id="category" name="category" defaultValue={f.category ?? ""}>
            <option value="">Everything</option>
            {Object.entries(ACTIVITY_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sub">Detail</label>
          <select id="sub" name="sub" defaultValue={f.subcategory ?? ""}>
            <option value="">Any</option>
            {[...new Set(subs.map((s) => s.subcategory))].sort().map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        <div><label htmlFor="q">Search</label><input id="q" name="q" defaultValue={f.search} placeholder="Name, address or text" /></div>
        <div className="period-pick">
          <label htmlFor="num">Period</label>
          <div className="row">
            <input id="num" type="number" min={1} max={366} name="num" defaultValue={f.num} style={{ width: 70 }} />
            <select name="unit" defaultValue={f.unit} aria-label="Unit" style={{ width: 100 }}>
              <option value="day">days</option><option value="week">weeks</option><option value="month">months</option><option value="year">years</option>
            </select>
            <select name="mode" defaultValue={f.mode} aria-label="Starting or ending" style={{ width: 110 }}>
              <option value="ending">ending</option><option value="starting">starting</option>
            </select>
            <input type="date" name="date" defaultValue={f.date} aria-label="Date" style={{ width: 160 }} />
          </div>
        </div>
        <button className="btn primary">Show</button>
      </form>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Customer</th><th>Description</th><th>By</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.date)}</td>
                <td>{ACTIVITY_CATEGORIES[r.category] ?? label(r.category)}</td>
                <td>{r.subcategory ? label(r.subcategory) : ""}</td>
                <td>{r.customerId && r.customerName ? <Link href={`/customers/${r.customerId}`}>{r.customerName}</Link> : ""}</td>
                <td>{r.summary}</td>
                <td className="muted">{r.userName ?? ""}</td>
                <td className="num">{money(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No activity in this period.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={6}>{rows.length} item{rows.length === 1 ? "" : "s"}</th><th className="num">{money(total)}</th></tr></tfoot>
        </table>
      </div>
    </>
  );
}
