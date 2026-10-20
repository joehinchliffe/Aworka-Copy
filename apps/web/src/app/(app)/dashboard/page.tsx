import Link from "next/link";
import { can } from "@rounds/domain";
import { dashboard } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, formatDay, todayIso } from "@/lib/time";

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayIso();
  const d = await dashboard(user.accountId, today);
  const showMoney = can(user.permissions, "view_reports");

  return (
    <>
      <div className="spread"><h1>Dashboard</h1><span className="muted">{formatDay(today)}</span></div>

      <div className="grid cols-4 dash-top">
        <Link href={`/planner/day/${today}`} className="stat stat-link">
          <div className="label">Jobs today</div>
          <div className="value">{d.today.done} / {d.today.count} done</div>
          {showMoney && <div className="small muted">{money(d.today.value)} planned</div>}
        </Link>
        <Link href="/planner" className="stat stat-link">
          <div className="label">Overdue jobs not planned</div>
          <div className={`value ${d.overdueCount ? "debt" : ""}`}>{d.overdueCount}</div>
        </Link>
        <Link href="/debts" className="stat stat-link">
          <div className="label">Debts</div>
          <div className={`value ${d.debts.owed ? "debt" : ""}`}>{money(d.debts.owed)}</div>
          <div className="small muted">{d.debts.count} customer{d.debts.count === 1 ? "" : "s"} owing</div>
        </Link>
      </div>

      {showMoney && (
        <section>
          <h2>Sales</h2>
          <div className="grid cols-4">
            {d.sales.map((s) => (
              <div key={s.key} className="stat">
                <div className="label">{s.label}</div>
                <div className="value">{money(s.jobs)}</div>
                <div className="small muted">{s.jobCount} job{s.jobCount === 1 ? "" : "s"} done · {money(s.payments)} received</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <section className="panel">
          <div className="spread"><h2 style={{ marginTop: 0 }}>Recent invoices</h2><Link href="/invoices" className="small">All invoices</Link></div>
          {d.invoices.length === 0 ? <p className="muted">No invoices yet.</p> : (
            <table>
              <thead><tr><th>Date</th><th>No.</th><th>Customer</th><th className="num">Total</th></tr></thead>
              <tbody>{d.invoices.map((i) => (
                <tr key={i.id}>
                  <td>{formatDate(i.issuedOn)}</td>
                  <td><Link href={`/invoices/${i.id}`}>{i.number}</Link></td>
                  <td><Link href={`/customers/${i.customerId}`}>{i.customerName}</Link></td>
                  <td className="num">{money(i.gross)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Coming up</h2>
          {d.events.length === 0 ? <p className="muted">Nothing in the next two weeks.</p> : (
            <ul className="event-list">
              {d.events.map((e) => (
                <li key={e.id}>
                  <span className="event-when">{formatDay(e.date)}{e.time ? ` ${e.time}` : ""}</span>
                  <span>{e.type === "to_do" && <span className="badge warn">To do</span>} {e.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
