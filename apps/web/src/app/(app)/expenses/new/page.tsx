import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { lastExpenseInCategory, listCategories, listSuppliers, taxTreatmentOf } from "@/lib/services/expenses";
import { createExpenseAction } from "../actions";
import { ExpenseForm, type ExpenseDefaults } from "../forms";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("record_expenses");
  const sp = await searchParams;
  const [categories, suppliers, account] = await Promise.all([
    listCategories(user.accountId), listSuppliers(user.accountId), accountFor(user.accountId),
  ]);
  const today = todayIso();
  let d: ExpenseDefaults = { date: today, vatRate: account?.vatRate ?? 0.2 };
  let copied = false;
  if (sp.copy) {
    const last = await lastExpenseInCategory(user.accountId, sp.copy);
    if (last) {
      copied = true;
      d = { ...last, date: today, taxTreatment: taxTreatmentOf(last, account?.collectsVat ?? false) };
    }
  }
  const enabled = categories.filter((c) => c.enabled);
  return (
    <>
      <div className="spread">
        <h1>New expense</h1>
        {enabled.length > 0 && (
          <form className="row no-print" aria-label="Copy the last expense in a category">
            <select name="copy" defaultValue={sp.copy ?? ""} aria-label="Category to copy from" style={{ width: 220 }}>
              <option value="">Copy last expense in…</option>
              {enabled.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn small">Copy</button>
          </form>
        )}
      </div>
      {sp.saved && <div className="notice ok">Expense saved.</div>}
      {sp.copy && !copied && <div className="notice exp-warn">There is no earlier expense in that category to copy.</div>}
      {copied && <div className="notice exp-info">Copied from the last expense in this category. Check the details, then save.</div>}
      <ExpenseForm key={sp.copy ?? "blank"} action={createExpenseAction} d={d} categories={categories} suppliers={suppliers} isNew />
    </>
  );
}
