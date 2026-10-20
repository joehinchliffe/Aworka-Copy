import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { getRound } from "@/lib/services/rounds";
import { deleteRoundAction, updateRoundAction } from "../actions";

export default async function EditRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const round = await getRound(user.accountId, id);
  if (!round) notFound();
  return (
    <>
      <h1>{round.name}</h1>
      <div className="panel narrow">
        <ActionForm action={updateRoundAction.bind(null, id)}>
          <label>Name</label><input name="name" defaultValue={round.name} required maxLength={60} />
          <label className="row check"><input type="checkbox" name="otherIncome" defaultChecked={round.otherIncome} /> Other income (not counted as round sales)</label>
        </ActionForm>
        <p className="row"><Link href={`/rounds/${id}/order`}>Change round order</Link> · <Link href="/rounds">Back to rounds</Link></p>
      </div>
      <div className="panel narrow" style={{ marginTop: 12 }}>
        <h2>Delete round</h2>
        <p className="small muted">Its jobs are kept but will no longer be on a round.</p>
        <ActionForm action={deleteRoundAction.bind(null, id)} submitLabel="Delete round" danger confirm={`Delete ${round.name}?`} />
      </div>
    </>
  );
}
