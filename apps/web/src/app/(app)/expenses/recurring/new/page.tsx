import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { listCategories, listSuppliers } from "@/lib/services/expenses";
import { createRecurringAction } from "../../actions";
import { RecurringForm } from "../../forms";

export default async function NewRecurringPage() {
  const user = await requireUser("record_expenses");
  const [categories, suppliers, account] = await Promise.all([
    listCategories(user.accountId), listSuppliers(user.accountId), accountFor(user.accountId),
  ]);
  return (
    <>
      <h1>New recurring expense</h1>
      <RecurringForm action={createRecurringAction} d={{ nextDueOn: todayIso(), vatRate: account?.vatRate ?? 0.2 }} categories={categories} suppliers={suppliers} />
    </>
  );
}
