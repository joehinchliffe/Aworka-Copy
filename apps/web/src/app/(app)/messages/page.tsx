import Link from "next/link";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { contactName } from "@/lib/services/ledger";
import { listMessages, MESSAGE_REASONS, MESSAGE_STATUSES } from "@/lib/services/messageHistory";
import { PeriodFields, readPeriod } from "@/components/PeriodFields";

const STATUS_BADGE: Record<string, string> = { sent: "ok", queued: "info", failed: "danger", draft: "warn" };

const when = (d: Date) => d.toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status && sp.status in MESSAGE_STATUSES ? sp.status : "";
  const reason = sp.reason && sp.reason in MESSAGE_REASONS ? sp.reason : "";
  const period = readPeriod(sp, { num: 1, unit: "month", anchor: "ending", date: todayIso() });
  const rows = await listMessages(user.accountId, { status: status || undefined, reason: reason || undefined, text: sp.q, start: period.start, end: period.end, customerId: sp.customer });
  return (
    <>
      <div className="spread">
        <h1>Messages</h1>
        <div className="row no-print"><Link className="btn" href="/messages/drafts/new">New mass message</Link></div>
      </div>
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <select name="status" defaultValue={status} style={{ maxWidth: 130 }} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(MESSAGE_STATUSES).filter(([k]) => k !== "draft").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="reason" defaultValue={reason} style={{ maxWidth: 190 }} aria-label="Reason">
          <option value="">All messages</option>
          {Object.entries(MESSAGE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} placeholder="Containing" style={{ maxWidth: 200 }} />
        <PeriodFields p={period} />
        {sp.customer && <input type="hidden" name="customer" value={sp.customer} />}
        <button className="btn">Refresh</button>
        <Link className="small" href="/messages">Reset</Link>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Created</th><th>Status</th><th>Reason</th><th>To</th><th>Message</th></tr></thead>
          <tbody>
            {rows.map(({ message: m, contact }) => (
              <tr key={m.id}>
                <td className="small" style={{ whiteSpace: "nowrap" }}>{when(m.createdAt)}</td>
                <td><span className={`badge ${STATUS_BADGE[m.status] ?? ""}`}>{MESSAGE_STATUSES[m.status] ?? m.status}</span></td>
                <td className="small">{MESSAGE_REASONS[m.reason] ?? m.reason}</td>
                <td className="small">{contact ? <Link href={`/customers/${m.customerId}`}>{contactName(contact)}</Link> : null}
                  <div className="muted">{m.channel === "sms" ? "SMS" : "Email"} · {m.to}</div></td>
                <td><Link href={`/messages/${m.id}`}>{m.subject || m.body.slice(0, 80) || "(empty)"}</Link>
                  {m.error && <div className="small debt">{m.error}</div>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">No messages in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
