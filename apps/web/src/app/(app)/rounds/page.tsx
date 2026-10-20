import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { listRounds } from "@/lib/services/rounds";
import { createRoundAction } from "./actions";

export default async function RoundsPage() {
  const user = await requireUser();
  const rows = await listRounds(user.accountId);
  const total = rows.reduce((t, r) => ({ jobs: t.jobs + r.jobs, value: t.value + r.value }), { jobs: 0, value: 0 });
  return (
    <>
      <h1>Rounds</h1>
      <div className="grid cols-2">
        <div>
          {rows.length === 0 ? <div className="panel"><h2>No rounds yet</h2><p>Group your jobs into rounds, for example by area or day.</p></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Round</th><th>Assigned to</th><th className="num">Jobs</th><th className="num">Value</th><th></th></tr></thead>
                <tbody>
                  {rows.map(({ round, userName, jobs, value }) => (
                    <tr key={round.id}>
                      <td><Link href={`/rounds/${round.id}`}>{round.name}</Link>{round.otherIncome && <span className="badge"> other income</span>}</td>
                      <td>{userName ?? <span className="muted">Unassigned</span>}</td>
                      <td className="num">{jobs}</td>
                      <td className="num">{money(value)}</td>
                      <td><Link className="small" href={`/rounds/${round.id}/order`}>Change order</Link></td>
                    </tr>
                  ))}
                  <tr><td><strong>Total</strong></td><td></td><td className="num"><strong>{total.jobs}</strong></td><td className="num"><strong>{money(total.value)}</strong></td><td></td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>New round</h2>
          <ActionForm action={createRoundAction} submitLabel="Add round">
            <label>Name</label><input name="name" required maxLength={60} />
            <label className="row check"><input type="checkbox" name="otherIncome" /> Other income (not counted as round sales)</label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
