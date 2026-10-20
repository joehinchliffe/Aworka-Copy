import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { listSalesSources, salesSourceTypes } from "@/lib/services/salesSources";
import { formatDate } from "@/lib/time";
import { createSalesSourceAction } from "./actions";
import { SourceFields } from "./SourceFields";

export default async function SalesSourcesPage() {
  const user = await requireUser();
  const [rows, types] = await Promise.all([listSalesSources(user.accountId), salesSourceTypes(user.accountId)]);
  const canEdit = user.permissions.has("edit_sales_sources") || user.permissions.has("administrator");
  return (
    <>
      <h1>Sales sources</h1>
      <p className="small muted">Record where new work comes from, then pick the source on each new job to see what pays off.</p>
      <div className="grid cols-2">
        <div>
          {rows.length === 0 ? <div className="panel"><h2>No sales sources yet</h2></div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Source</th><th>Reference</th><th>Notes</th><th>Added</th><th className="num">Jobs</th></tr></thead>
                <tbody>
                  {rows.map(({ source, jobs }) => (
                    <tr key={source.id}>
                      <td>{canEdit ? <Link href={`/sales-sources/${source.id}`}>{source.type}</Link> : source.type}</td>
                      <td>{source.reference}</td>
                      <td className="small">{source.notes}</td>
                      <td>{formatDate(source.createdAt.toISOString().slice(0, 10))}</td>
                      <td className="num">{jobs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="panel">
            <h2>New sales source</h2>
            <ActionForm action={createSalesSourceAction} submitLabel="Add sales source"><SourceFields types={types} /></ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
