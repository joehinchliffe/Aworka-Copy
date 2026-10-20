import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { getSalesSource, salesSourceTypes } from "@/lib/services/salesSources";
import { deleteSalesSourceAction, updateSalesSourceAction } from "../actions";
import { SourceFields } from "../SourceFields";

export default async function EditSalesSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("edit_sales_sources");
  const source = await getSalesSource(user.accountId, id);
  if (!source) notFound();
  const types = await salesSourceTypes(user.accountId);
  return (
    <>
      <h1>Edit sales source</h1>
      <div className="panel narrow">
        <ActionForm action={updateSalesSourceAction.bind(null, id)}><SourceFields d={source} types={types} /></ActionForm>
        <p><Link href="/sales-sources">Back to sales sources</Link></p>
      </div>
      <div className="panel narrow" style={{ marginTop: 12 }}>
        <h2>Delete sales source</h2>
        <p className="small muted">Jobs from this source are kept; they will no longer show a source.</p>
        <ActionForm action={deleteSalesSourceAction.bind(null, id)} submitLabel="Delete" danger confirm="Delete this sales source?" />
      </div>
    </>
  );
}
