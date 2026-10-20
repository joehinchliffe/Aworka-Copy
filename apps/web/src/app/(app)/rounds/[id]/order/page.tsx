import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { frequencyLabel } from "@/lib/format";
import { roundsFor } from "@/lib/lookups";
import { requireUser } from "@/lib/session";
import { getRound, roundJobs } from "@/lib/services/rounds";
import { saveRoundOrderAction } from "../../actions";
import { RoundOrderList } from "./RoundOrderList";

export default async function RoundOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const round = await getRound(user.accountId, id);
  if (!round) notFound();
  const [jobs, rounds] = await Promise.all([roundJobs(user.accountId, id), roundsFor(user.accountId)]);
  return (
    <>
      <div className="spread">
        <h1>Round order: {round.name}</h1>
        <div className="row">
          {rounds.filter((r) => r.id !== id).map((r) => <Link key={r.id} className="btn small" href={`/rounds/${r.id}/order`}>{r.name}</Link>)}
        </div>
      </div>
      <p className="small muted">Drag jobs, or use the arrows, into the order you visit them. The planner can list due jobs in this order.</p>
      {jobs.length === 0 ? <div className="panel">There are no jobs on this round. <Link href="/rounds">Back to rounds</Link></div> : (
        <div className="panel">
          <ActionForm key={jobs.map((j) => j.spec.id).join()} action={saveRoundOrderAction.bind(null, id)} submitLabel="Save order">
            <RoundOrderList items={jobs.map((j) => ({
              id: j.spec.id, name: j.name, customerName: j.customerName,
              detail: [frequencyLabel(j.spec), j.spec.status !== "active" ? j.spec.status : ""].filter(Boolean).join(" · "),
            }))} />
          </ActionForm>
        </div>
      )}
    </>
  );
}
