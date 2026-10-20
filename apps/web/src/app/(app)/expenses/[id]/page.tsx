import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { getExpense, listCategories, listSuppliers } from "@/lib/services/expenses";
import { deleteExpenseAction, updateExpenseAction } from "../actions";
import { ConfirmButton, ExpenseForm } from "../forms";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("record_expenses");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [found, categories, suppliers] = await Promise.all([
    getExpense(user.accountId, id), listCategories(user.accountId), listSuppliers(user.accountId),
  ]);
  if (!found) notFound();
  const { expense: e, taxTreatment } = found;
  return (
    <>
      <div className="spread">
        <h1>Edit expense</h1>
        <div className="row">
          <Link className="btn" href={`/expenses/new?copy=${e.categoryId}`}>Duplicate</Link>
          <ConfirmButton action={deleteExpenseAction.bind(null, id)} label="Delete" question="Delete this expense?" />
        </div>
      </div>
      {e.recurringExpenseId && (
        <div className="notice exp-info">
          Added by a <Link href={`/expenses/recurring/${e.recurringExpenseId}`}>recurring expense</Link>. Changes here affect only this expense.
        </div>
      )}
      {e.amount != null && (
        <p className="small muted">Reclaimable VAT {money(e.reclaimableVat)} · allowable for income tax {money(e.allowable)}</p>
      )}
      <ExpenseForm action={updateExpenseAction.bind(null, id)} d={{ ...e, taxTreatment }} categories={categories} suppliers={suppliers} />
    </>
  );
}
