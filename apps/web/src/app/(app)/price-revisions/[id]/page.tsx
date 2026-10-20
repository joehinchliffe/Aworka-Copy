import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { money } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getRevision, latestRevisionByJob, revisionJobNames } from "@/lib/services/priceRevisions";
import { formatDate } from "@/lib/time";
import { revertJobAction, revertRevisionAction } from "../actions";

export default async function PriceRevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const rev = await getRevision(user.accountId, id);
  if (!rev) notFound();
  const ids = rev.changes.map((c) => c.jobSpecId);
  const [names, latest] = await Promise.all([revisionJobNames(user.accountId, ids), latestRevisionByJob(user.accountId, ids)]);
  const reverted = ((rev.rule as { reverted?: { jobSpecId: string; on: string }[] }).reverted ?? []);
  return (
    <>
      <div className="spread">
        <div>
          <h1>Price revision</h1>
          <div className="muted">{rev.description} · applied {formatDate(rev.createdAt.toISOString().slice(0, 10))}
            {rev.revertedAt && <> · <span className="badge">reverted</span></>}</div>
        </div>
        <Link className="btn" href="/price-revisions">All price revisions</Link>
      </div>

      {rev.changes.length > 0 && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="spread">
            <h2>{rev.changes.length} job{rev.changes.length === 1 ? "" : "s"} changed</h2>
            <ActionForm action={revertRevisionAction.bind(null, id)} submitLabel="Revert all" danger confirm="Put these jobs back to their previous prices?" className="inline-form" />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Job</th><th className="num">Was</th><th className="num">Revised to</th><th className="num">Now</th><th></th></tr></thead>
              <tbody>
                {rev.changes.map((c) => {
                  const n = names.get(c.jobSpecId);
                  const isLatest = latest.get(c.jobSpecId) === id;
                  return (
                    <tr key={c.jobSpecId}>
                      <td>{n ? <Link href={`/customers/${n.customerId}`}>{n.name}</Link> : <span className="muted">Deleted job</span>}</td>
                      <td className="num">{money(c.from)}</td>
                      <td className="num">{money(c.to)}</td>
                      <td className="num">{n ? money(n.price) : ""}</td>
                      <td>{isLatest && n?.price === c.to
                        ? <ActionForm action={revertJobAction.bind(null, id, c.jobSpecId)} submitLabel="Revert" className="inline-form" />
                        : <span className="small muted">{isLatest ? "price edited since" : "a later revision applies"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reverted.length > 0 && <p className="small muted">{reverted.length} job{reverted.length === 1 ? " has" : "s have"} been reverted from this revision.</p>}
    </>
  );
}
