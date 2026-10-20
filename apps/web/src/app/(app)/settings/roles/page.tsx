import Link from "next/link";
import { Permissions } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { listRoles } from "@/lib/services/users";

export default async function RolesPage() {
  const user = await requireUser("administrator");
  const rows = await listRoles(user.accountId);
  return (
    <>
      <div className="spread">
        <h1>Roles</h1>
        <Link className="btn primary" href="/settings/roles/new">New role</Link>
      </div>
      <p className="small muted">A role decides what its users can see and do. The account owner can always do everything.</p>
      {rows.length === 0 ? <div className="panel">No roles yet.</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Role</th><th className="num">Permissions</th><th className="num">Users</th></tr></thead>
            <tbody>
              {rows.map(({ role, users }) => (
                <tr key={role.id}>
                  <td><Link href={`/settings/roles/${role.id}`}>{role.name}</Link>
                    {role.permissions.includes("administrator") && <span className="badge info"> administrator</span>}</td>
                  <td className="num">{role.permissions.length} of {Permissions.length}</td>
                  <td className="num">{users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
