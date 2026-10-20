import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { listRounds } from "@/lib/services/rounds";
import { listUsers } from "@/lib/services/users";
import { money } from "@/lib/format";
import { assignRoundsAction } from "../actions";

export default async function RoundAssignmentsPage() {
  const user = await requireUser("administrator");
  const [rounds, users] = await Promise.all([listRounds(user.accountId), listUsers(user.accountId)]);
  return (
    <>
      <h1>Round assignments</h1>
      <p className="small muted">Users without the administrator permission only see jobs on rounds assigned to them.</p>
      {rounds.length === 0 ? (
        <div className="panel"><h2>There are no rounds to assign</h2><p><Link href="/rounds">Create a round</Link> first.</p></div>
      ) : (
        <ActionForm action={assignRoundsAction}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Round</th><th className="num">Jobs</th><th className="num">Value</th><th>Assigned to</th></tr></thead>
              <tbody>
                {rounds.map(({ round, jobs, value }) => (
                  <tr key={round.id}>
                    <td>{round.name}</td>
                    <td className="num">{jobs}</td>
                    <td className="num">{money(value)}</td>
                    <td>
                      <select name={`round.${round.id}`} defaultValue={round.userId ?? ""} style={{ maxWidth: 260 }}>
                        <option value="">Unassigned</option>
                        {users.map(({ user: u }) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      )}
    </>
  );
}
