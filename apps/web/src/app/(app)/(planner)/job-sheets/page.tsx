import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { money, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatDate, formatDay, todayIso } from "@/lib/time";
import { clampDays, JOB_SHEET_STATUSES, jobSheet, type JobSheetStatus } from "@/lib/services/jobSheets";
import { PrintButton } from "@/components/PrintButton";
import { emailJobSheetAction, saveDayNotesAction } from "./actions";

const STATUS_LABEL: Record<string, string> = { to_do: "To do", done: "Done", not_done: "Not done", skipped: "Skipped", estimate: "Estimate" };

export default async function JobSheetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIso();
  const days = clampDays(sp.days ?? 1);
  const status = (sp.status && sp.status in JOB_SHEET_STATUSES ? sp.status : "all") as JobSheetStatus;
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
    .where(eq(schema.users.accountId, user.accountId)).orderBy(asc(schema.users.name));
  const userParam = sp.user ?? user.id;
  const sheetUser = userParam === "all" ? null : users.find((u) => u.id === userParam) ?? null;
  const sheetUserId = sheetUser?.id ?? null;
  const userLabel = sheetUser?.name ?? "everyone";
  const sheet = await jobSheet(user.accountId, { start, days, status, userId: sheetUserId });
  const totals = sheet.reduce((t, d) => ({ jobs: t.jobs + d.rows.length, value: t.value + d.totalValue }), { jobs: 0, value: 0 });
  const showPrices = user.permissions.has("show_account_customer_prices") || user.permissions.has("administrator");
  const canEditNotes = user.permissions.has("edit_jobs") || user.permissions.has("administrator");
  const qs = new URLSearchParams({ source: "job_sheet", start, days: String(days), status, user: sheetUserId ?? "all" });

  return (
    <>
      <div className="spread">
        <h1>Job sheet for {userLabel}: {formatDate(start)}{days > 1 ? ` + ${days - 1} day${days > 2 ? "s" : ""}` : ""}</h1>
        <div className="row no-print">
          <PrintButton />
          <form action={emailJobSheetAction.bind(null, { start, days, status, userId: sheetUserId, userLabel })}>
            <button className="btn">Email to me</button>
          </form>
          {totals.jobs > 0 && <Link className="btn" href={`/messages/drafts/new?${qs}`}>Message these customers</Link>}
        </div>
      </div>
      {sp.emailed && <div className="notice ok no-print">The job sheet has been queued to {user.email}.</div>}
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <select name="user" defaultValue={sheetUserId ?? "all"} style={{ maxWidth: 200 }} aria-label="User">
          <option value="all">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select name="status" defaultValue={status} style={{ maxWidth: 260 }} aria-label="Jobs">
          {Object.entries(JOB_SHEET_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="days" defaultValue={days} style={{ maxWidth: 110 }} aria-label="Number of days">
          {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
        </select>
        <span className="muted small">starting</span>
        <input type="date" name="date" defaultValue={start} style={{ maxWidth: 170 }} aria-label="Start date" />
        <button className="btn">Refresh</button>
        <Link className="small" href="/job-sheets">Reset</Link>
      </form>

      {sheet.map((d) => (
        <section key={d.date} className="jobsheet-day">
          <div className="spread">
            <h2><Link href={`/planner/day/${d.date}`}>{formatDay(d.date)}</Link></h2>
            <span className="muted small">{d.rows.length} job{d.rows.length === 1 ? "" : "s"} · {money(d.totalValue)} · {Math.floor(d.totalMinutes / 60)}h {d.totalMinutes % 60}m</span>
          </div>
          {d.topNotes && <p className="jobsheet-note">{d.topNotes}</p>}
          <div className="table-wrap">
            <table className="jobsheet">
              <thead>
                <tr><th>#</th><th>Job</th><th>Customer</th><th>Phone</th><th className="num">Price</th><th>Notes</th><th>Pays</th><th className="num">Balance</th><th className="jobsheet-paid">Paid</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={r.jobId}>
                    <td>{i + 1}</td>
                    <td><strong>{r.name}</strong>
                      <div className="small muted">{r.address}</div>
                      {r.status !== "to_do" && <span className="badge">{STATUS_LABEL[r.status] ?? r.status}</span>}
                      {r.confirmed === false && <span className="badge warn">unconfirmed</span>}
                      {r.paidAmount > 0 && <span className="badge ok">paid {money(r.paidAmount)}</span>}</td>
                    <td><Link href={`/customers/${r.customerId}`}>{r.customerName}</Link>{r.roundName && <div className="small muted">{r.roundName}</div>}</td>
                    <td className="small">{r.phone ?? ""}</td>
                    <td className="num">{showPrices || !["email_invoice", "paper_invoice"].includes(r.paymentMethod) ? money(r.gross) : ""}</td>
                    <td className="small">{r.notes ?? ""}</td>
                    <td className="small">{PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod}</td>
                    <td className={`num ${r.balance < 0 ? "debt" : r.balance > 0 ? "credit" : "muted"}`}>{r.balance === 0 ? "" : money(r.balance)}</td>
                    <td className="jobsheet-paid" aria-label="Write in amount paid"></td>
                  </tr>
                ))}
                {d.rows.length === 0 && <tr><td colSpan={9} className="muted">No matching jobs.</td></tr>}
              </tbody>
              <tfoot>
                <tr><th colSpan={4}>Day total ({d.rows.length})</th><th className="num">{money(d.totalValue)}</th><th colSpan={4}></th></tr>
              </tfoot>
            </table>
          </div>
          {d.bottomNotes && <p className="jobsheet-note">{d.bottomNotes}</p>}
          {canEditNotes && (
            <details className="no-print">
              <summary className="small">Day notes</summary>
              <form action={saveDayNotesAction.bind(null, sheetUserId, d.date)} className="grid cols-2" style={{ marginTop: 6 }}>
                <div><label>Top notes</label><textarea name="topNotes" defaultValue={d.topNotes ?? ""} /></div>
                <div><label>Bottom notes</label><textarea name="bottomNotes" defaultValue={d.bottomNotes ?? ""} /></div>
                <div><button className="btn small">Save notes</button></div>
              </form>
            </details>
          )}
        </section>
      ))}
      {days > 1 && <p className="jobsheet-total"><strong>Total for {days} days:</strong> {totals.jobs} jobs · {money(totals.value)}</p>}
    </>
  );
}
