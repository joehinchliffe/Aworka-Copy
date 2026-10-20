import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listTemplates, TEMPLATE_PURPOSES } from "@/lib/services/templates";

export default async function TemplatesPage() {
  const user = await requireUser();
  const rows = await listTemplates(user.accountId);
  return (
    <>
      <div className="spread">
        <h1>Message templates</h1>
        <Link className="btn primary" href="/messages/templates/new">New template</Link>
      </div>
      {rows.length === 0 ? (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>No templates yet</h2>
          <p>Templates hold the wording for emails and texts, with merge tags such as #first_name and #balance filled in for each customer.</p>
          <Link className="btn primary" href="/messages/templates/new">New template</Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Purpose</th><th>Email</th><th>SMS</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/messages/templates/${t.id}`}>{t.name}</Link></td>
                  <td>{TEMPLATE_PURPOSES[t.purpose as keyof typeof TEMPLATE_PURPOSES] ?? t.purpose}</td>
                  <td className="small">{t.emailBody ? (t.emailSubject || "(no subject)") : <span className="muted">—</span>}</td>
                  <td className="small">{t.smsBody ? t.smsBody.slice(0, 60) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
