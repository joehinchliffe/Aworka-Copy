import { requireUser } from "@/lib/session";
import { listApiTokens } from "@/lib/services/api";
import { accountFor } from "@/lib/lookups";
import { hasFeature } from "@/lib/plans";
import { NewTokenForm } from "@/components/NewTokenForm";
import { formatDate, todayIso } from "@/lib/time";
import { createTokenAction, revokeTokenAction } from "./actions";

export default async function ApiPage() {
  const user = await requireUser("edit_settings");
  const account = (await accountFor(user.accountId))!;
  if (!hasFeature(account, "api", todayIso())) return <><h1>API</h1><p className="muted">API access is part of the Team plan.</p></>;
  const tokens = await listApiTokens(user.accountId);
  return (
    <>
      <h1>API access</h1>
      <p>Use a personal access token with <code>Authorization: Bearer &lt;token&gt;</code>. Endpoints: <code>GET /api/v1/customers</code>, <code>GET /api/v1/customers/:id</code>,
        <code> POST /api/v1/customers</code>, <code>POST /api/v1/customers/:id/payments</code>, <code>GET /api/v1/jobs?from=&amp;to=</code>, <code>GET /api/v1/invoices</code>.</p>
      <div className="panel"><NewTokenForm action={createTokenAction} /></div>
      <div className="table-wrap" style={{ marginTop: 12 }}><table>
        <thead><tr><th>Label</th><th>Starts with</th><th>Created</th><th>Last used</th><th></th></tr></thead>
        <tbody>{tokens.map((t) => (
          <tr key={t.id}><td>{t.label}</td><td><code>{t.prefix}…</code></td><td>{formatDate(t.createdAt.toISOString().slice(0, 10))}</td>
            <td>{t.lastUsedAt ? formatDate(t.lastUsedAt.toISOString().slice(0, 10)) : "Never"}</td>
            <td><form action={revokeTokenAction.bind(null, t.id)}><button className="btn small danger">Revoke</button></form></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}
