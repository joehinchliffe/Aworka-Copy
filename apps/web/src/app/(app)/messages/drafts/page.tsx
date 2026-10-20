import Link from "next/link";
import { requireUser } from "@/lib/session";
import { smsSegments } from "@/lib/sms";
import { listDrafts } from "@/lib/services/drafts";
import { deliverDraftsAction, discardDraftsAction } from "../actions";

export default async function DraftsPage() {
  const user = await requireUser();
  const drafts = await listDrafts(user.accountId);
  const smsParts = drafts.filter((d) => d.channel === "sms").reduce((n, d) => n + smsSegments(d.body).segments, 0);
  const emails = drafts.filter((d) => d.channel === "email").length;
  if (drafts.length === 0) {
    return (
      <div className="panel">
        <h1>Drafts</h1>
        <p>There are no draft messages.</p>
        <p>To draft messages to your customers, open a <Link href="/job-sheets">job sheet</Link> and choose Message these customers, or start a <Link href="/messages/drafts/new">new mass message</Link> for a round or customers in debt.</p>
      </div>
    );
  }
  return (
    <form>
      <div className="spread">
        <h1>Drafts ({drafts.length})</h1>
        <div className="row">
          <Link className="btn" href="/messages/drafts/new">Add more</Link>
          <button className="btn danger" formAction={discardDraftsAction} name="all" value="1">Discard all</button>
          <button className="btn primary" formAction={deliverDraftsAction} name="all" value="1">Deliver all</button>
        </div>
      </div>
      <p className="muted small">{emails} email{emails === 1 ? "" : "s"} and {drafts.length - emails} text{drafts.length - emails === 1 ? "" : "s"} ({smsParts} SMS part{smsParts === 1 ? "" : "s"}). Check each preview, untick any you don&apos;t want, then deliver.</p>
      <div className="grid">
        {drafts.map((d) => {
          const sms = d.channel === "sms" ? smsSegments(d.body) : null;
          return (
            <label key={d.id} className="panel draft-preview">
              <div className="spread">
                <span className="row" style={{ color: "var(--ink)" }}><input type="checkbox" name="id" value={d.id} defaultChecked />
                  <strong>{d.channel === "sms" ? "SMS" : "Email"} to {d.to}</strong></span>
                {sms && <span className="small muted">{sms.units} chars · {sms.segments} part{sms.segments === 1 ? "" : "s"}</span>}
              </div>
              {d.subject && <div><strong>{d.subject}</strong></div>}
              <pre className="message-body">{d.body}</pre>
            </label>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" formAction={discardDraftsAction}>Discard ticked</button>
        <button className="btn primary" formAction={deliverDraftsAction}>Deliver ticked</button>
      </div>
    </form>
  );
}
