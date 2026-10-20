import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listRevisions } from "@/lib/services/priceRevisions";
import { formatDate } from "@/lib/time";

export default async function PriceRevisionsPage() {
  const user = await requireUser();
  const rows = await listRevisions(user.accountId);
  return (
    <>
      <div className="spread">
        <h1>Price revisions</h1>
        <Link className="btn primary" href="/price-revisions/new">New price revision</Link>
      </div>
      <p className="small muted">Raise (or lower) many job prices at once. Jobs on a task change through the task&apos;s price instead.</p>
      {rows.length === 0 ? <div className="panel"><h2>There are no price revisions</h2></div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Revision</th><th className="num">Jobs changed</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt.toISOString().slice(0, 10))}</td>
                  <td><Link href={`/price-revisions/${r.id}`}>{r.description}</Link></td>
                  <td className="num">{r.changes.length}</td>
                  <td>{r.revertedAt ? <span className="badge">reverted</span> : <span className="badge ok">applied</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
