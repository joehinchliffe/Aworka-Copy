import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { smsSegments } from "@/lib/sms";
import { contactName } from "@/lib/services/ledger";
import { getMessage, MESSAGE_REASONS, MESSAGE_STATUSES } from "@/lib/services/messageHistory";
import { retryMessageAction } from "../actions";

const when = (d: Date | null) => (d ? d.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }) : "");
const BADGE: Record<string, string> = { sent: "ok", queued: "info", failed: "danger", draft: "warn" };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const row = await getMessage(user.accountId, id);
  if (!row) notFound();
  const { message: m, contact } = row;
  const sms = m.channel === "sms" ? smsSegments(m.body) : null;
  return (
    <>
      <div className="spread">
        <h1>{m.subject || (m.channel === "sms" ? "SMS" : "Email")}</h1>
        <Link className="btn" href="/messages">Back</Link>
      </div>
      <div className="panel" style={{ maxWidth: 760 }}>
        <dl className="message-meta">
          <dt>Status</dt><dd><span className={`badge ${BADGE[m.status] ?? ""}`}>{MESSAGE_STATUSES[m.status] ?? m.status}</span>
            {m.error && <span className="small debt"> {m.error}</span>}</dd>
          <dt>Reason</dt><dd>{MESSAGE_REASONS[m.reason] ?? m.reason}</dd>
          <dt>Customer</dt><dd>{contact ? <Link href={`/customers/${m.customerId}`}>{contactName(contact)}</Link> : "—"}</dd>
          <dt>{m.channel === "sms" ? "SMS to" : "Email to"}</dt><dd>{m.to}</dd>
          <dt>Created</dt><dd>{when(m.createdAt)}</dd>
          {m.sentAt && <><dt>Sent</dt><dd>{when(m.sentAt)}</dd></>}
          {sms && <><dt>Length</dt><dd>{sms.units} characters · {sms.segments} part{sms.segments === 1 ? "" : "s"} ({sms.encoding})</dd></>}
        </dl>
        <pre className="message-body">{m.body}</pre>
        {m.status === "failed" && (
          <form action={retryMessageAction.bind(null, m.id)}><button className="btn">Try again</button></form>
        )}
      </div>
    </>
  );
}
