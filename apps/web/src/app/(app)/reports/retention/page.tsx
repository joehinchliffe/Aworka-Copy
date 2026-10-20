import { customerRetention } from "@/lib/services/reports";
import { requireUser } from "@/lib/session";
import { formatDate, todayIso } from "@/lib/time";
import { PrintButton } from "../PrintButton";

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const user = await requireUser("view_reports");
  const sp = await searchParams;
  const end = sp.end && /^\d{4}-\d{2}-\d{2}$/.test(sp.end) ? sp.end : todayIso();
  const r = await customerRetention(user.accountId, end);
  return (
    <>
      <div className="spread"><h1>Customer retention</h1><PrintButton /></div>
      <p className="muted">The 12 months from {formatDate(r.start)} to {formatDate(r.end)}.</p>
      <form className="row no-print" style={{ marginBottom: 12 }}>
        <label htmlFor="end">Ending</label>
        <input id="end" type="date" name="end" defaultValue={end} style={{ width: 170 }} />
        <button className="btn">Show</button>
      </form>
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Retention</div><div className="value">{r.retentionPercent == null ? "–" : `${r.retentionPercent}%`}</div></div>
        <div className="stat"><div className="label">Customers at start</div><div className="value">{r.atStart}</div></div>
        <div className="stat"><div className="label">Gained</div><div className="value credit">+{r.gained}</div></div>
        <div className="stat"><div className="label">Lost</div><div className="value debt">−{r.lost}</div></div>
        <div className="stat"><div className="label">Retained from start</div><div className="value">{r.retained}</div></div>
        <div className="stat"><div className="label">Customers at end</div><div className="value">{r.atEnd}</div></div>
      </div>
      <div className="panel small muted">
        <p style={{ marginTop: 0 }}>A customer counts as active when they have had a job done within two of their cleaning cycles.</p>
        <p>Gained customers had their first job done during the period. Lost customers stopped being active, were deleted, or had all their jobs suspended or deleted by the end of the period.</p>
        <p style={{ marginBottom: 0 }}>Retention is the share of customers active at the start who were still active at the end.</p>
      </div>
    </>
  );
}
