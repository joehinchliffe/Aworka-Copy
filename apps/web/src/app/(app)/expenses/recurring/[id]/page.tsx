import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { getRecurring, listCategories, listSuppliers, recurringActive } from "@/lib/services/expenses";
import { deleteRecurringAction, updateRecurringAction } from "../../actions";
import { ConfirmButton, RecurringForm } from "../../forms";

export default async function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("record_expenses");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, categories, suppliers] = await Promise.all([
    getRecurring(user.accountId, id), listCategories(user.accountId), listSuppliers(user.accountId),
  ]);
  if (!found) notFound();
  const { recurring: r, generated } = found;
  return (
    <>
      <div className="spread">
        <h1>Recurring expense</h1>
        <ConfirmButton action={deleteRecurringAction.bind(null, id)} label="Delete"
          question="Stop this recurring expense? Expenses already added are kept." />
      </div>
      {!recurringActive(r) && <div className="notice exp-info">This recurring expense has finished. Change how long it continues to restart it.</div>}
      <div className="grid cols-2">
        <RecurringForm action={updateRecurringAction.bind(null, id)} categories={categories} suppliers={suppliers}
          d={{ ...r, count: r.remainingCount }} />
        <div>
          <h2 style={{ marginTop: 0 }}>Added so far</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {generated.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/expenses/${e.id}`}>{formatDate(e.date)}</Link></td>
                    <td>{e.description}</td>
                    <td className="num">{e.amount == null ? <span className="badge warn">to add</span> : money(e.amount)}</td>
                  </tr>
                ))}
                {generated.length === 0 && <tr><td colSpan={3} className="muted">None yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
