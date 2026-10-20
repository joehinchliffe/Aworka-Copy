import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays } from "@rounds/domain";
import { dueJobs, plannerRange } from "@/lib/services/planning";
import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { money, PAY_METHODS } from "@/lib/format";
import { formatDate, formatDay, todayIso } from "@/lib/time";
import { addJobsAction, completeJobAction, nudgeAction, removeJobAction } from "../../actions";

const STATUS_BADGE: Record<string, string> = { to_do: "info", done: "ok", not_done: "danger", skipped: "", estimate: "warn" };

export default async function DayPage({ params, searchParams }: { params: Promise<{ date: string }>; searchParams: Promise<{ order?: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const user = await requireUser();
  const account = await accountFor(user.accountId);
  const order = ((await searchParams).order as "next_due" | "round_order") ?? account?.settings.addJobsOrder ?? "next_due";
  const [byDate, due] = await Promise.all([plannerRange(user.accountId, date, date), dueJobs(user.accountId, date, order)]);
  const jobs = byDate.get(date) ?? [];
  const today = todayIso();
  const totals = jobs.reduce((t, j) => ({ value: t.value + j.gross, mins: t.mins + j.timeRequired, done: t.done + (j.status === "done" ? j.gross : 0) }), { value: 0, mins: 0, done: 0 });
  return (
    <>
      <div className="spread">
        <h1>{formatDay(date)}</h1>
        <div className="row no-print">
          <Link className="btn" href={`/planner/day/${addDays(date, -1)}`}>‹</Link>
          <Link className="btn" href={`/planner/day/${today}`}>Today</Link>
          <Link className="btn" href={`/planner/day/${addDays(date, 1)}`}>›</Link>
          <Link className="btn" href={`/planner?month=${date.slice(0, 7)}`}>Month</Link>
          <Link className="btn" href={`/job-sheets?date=${date}`}>Print job sheet</Link>
        </div>
      </div>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Jobs</div><div className="value">{jobs.length}</div></div>
        <div className="stat"><div className="label">Value</div><div className="value">{money(totals.value)}</div></div>
        <div className="stat"><div className="label">Done</div><div className="value">{money(totals.done)}</div></div>
        <div className="stat"><div className="label">Time</div><div className="value">{Math.floor(totals.mins / 60)}h {totals.mins % 60}m</div></div>
      </div>
      <div className="grid cols-2">
        <section className="panel">
          <h2>Jobs for the day</h2>
          {jobs.length === 0 && <p className="muted">No jobs planned. Add due jobs from the list.</p>}
          {jobs.map((j) => (
            <div key={j.id} className="jobsheet-row">
              <div>
                <div><strong>{j.name}</strong> <span className={`badge ${STATUS_BADGE[j.status] ?? ""}`}>{j.status.replace("_", " ")}</span>
                  {j.apptType === "first" && <span className="badge info"> new</span>}{!j.allowed && <span className="badge danger"> not allowed today</span>}
                  {j.paid && <span className="badge ok"> paid</span>}</div>
                <div className="small muted">{j.customerName}{j.roundName ? ` · ${j.roundName}` : ""} · {money(j.gross)} · {j.timeRequired} min</div>
                {j.notes && <div className="small">Note: {j.notes}</div>}
                <details>
                  <summary className="small">Update job</summary>
                  <form action={completeJobAction.bind(null, j.id)} className="grid" style={{ marginTop: 6 }}>
                    <div className="field-row">
                      <div><label>Status</label>
                        <select name="status" defaultValue={j.status === "to_do" || j.status === "estimate" ? "done" : j.status}>
                          <option value="done">Done</option><option value="not_done">Not done</option><option value="skipped">Skipped</option><option value="to_do">To do</option>
                        </select></div>
                      <div><label>Paid £</label><input name="paid" type="number" step="0.01" placeholder="Blank = unpaid" /></div>
                      <div><label>Method</label><select name="method" defaultValue="cash">{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                    </div>
                    <label className="row"><input type="checkbox" name="includesTip" defaultChecked /> Amount over the price is a tip</label>
                    <div className="field-row">
                      <div><label>Price £</label><input name="price" type="number" step="0.01" defaultValue={(j.price / 100).toFixed(2)} /></div>
                      <div><label>&nbsp;</label><label className="row"><input type="checkbox" name="permanent" /> Keep new price</label></div>
                      <div><label>Next visit</label>
                        <select name="planNext" defaultValue="auto"><option value="auto">By frequency</option><option value="on_date">On date…</option><option value="no">Don't plan</option></select></div>
                      <div><label>Date</label><input name="planNextDate" type="date" /></div>
                    </div>
                    {j.confirmed !== null && <label className="row"><input type="checkbox" name="confirmed" defaultChecked={j.confirmed ?? false} /> Appointment confirmed</label>}
                    <label>Notes</label><input name="notes" defaultValue={j.notes ?? ""} />
                    <div className="row"><button className="btn primary">Save</button></div>
                  </form>
                  {(j.status === "to_do" || j.status === "estimate") && (
                    <form action={removeJobAction.bind(null, j.id)}><button className="btn small danger">Remove from day</button></form>
                  )}
                </details>
              </div>
              <div className="num"><Link href={`/customers/${j.customerId}`} className="small">Customer</Link></div>
            </div>
          ))}
          {date === today && (
            <form action={nudgeAction.bind(null, addDays(today, -1), today)} style={{ marginTop: 12 }}>
              <button className="btn small">Bring yesterday's unfinished jobs to today</button>
            </form>
          )}
        </section>
        <section className="panel">
          <div className="spread"><h2>Add due jobs</h2>
            <div className="small"><Link href={`?order=next_due`}>By due date</Link> · <Link href={`?order=round_order`}>By round</Link></div></div>
          <form action={addJobsAction.bind(null, date)}>
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {due.length === 0 && <p className="muted">Nothing due.</p>}
              {due.map((d) => {
                const late = d.lateness ?? 0;
                const color = d.spec.status === "estimate" ? "var(--warn)" : late > 0.25 ? "var(--danger)" : late > -0.1 ? "var(--ink)" : "var(--muted)";
                return (
                  <label key={d.spec.id} className="row" style={{ color, margin: "4px 0" }}>
                    <input type="checkbox" name="specId" value={d.spec.id} />
                    <span>{d.name} <span className="small muted">· {d.customerName}{d.round ? ` · ${d.round.name}` : ""} · due {d.spec.nextDueOn ? formatDate(d.spec.nextDueOn) : d.spec.status === "estimate" ? "estimate" : "on request"} · {money(d.spec.price)}</span></span>
                  </label>
                );
              })}
            </div>
            {due.length > 0 && <button className="btn primary" style={{ marginTop: 8 }}>Add to {formatDay(date)}</button>}
          </form>
        </section>
      </div>
    </>
  );
}
