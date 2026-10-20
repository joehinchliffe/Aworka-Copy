import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listUsers } from "@/lib/services/users";

export default async function UsersPage() {
  const user = await requireUser("administrator");
  const rows = await listUsers(user.accountId);
  const names = new Map(rows.map((r) => [r.user.id, r.user.name]));
  return (
    <>
      <div className="spread">
        <h1>Users</h1>
        <Link className="btn primary" href="/settings/users/new">New user</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Manager</th></tr></thead>
          <tbody>
            {rows.map(({ user: u, role }) => (
              <tr key={u.id}>
                <td><Link href={`/settings/users/${u.id}`}>{u.name}</Link>{u.isOwner && <span className="badge info"> owner</span>}</td>
                <td>{u.email}</td>
                <td>{u.phone}</td>
                <td>{u.isOwner ? "Owner (all permissions)" : role?.name ?? <span className="muted">No role</span>}</td>
                <td>{u.managerId ? names.get(u.managerId) : <span className="muted">Self managed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
