import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listCategories } from "@/lib/services/expenses";
import { deleteCategoryAction, saveCategoryAction } from "../actions";
import { NamedItemRow, NewNamedItem } from "../forms";

const FLAGS = [{ name: "capitalAsset", label: "Capital asset" }];

export default async function CategoriesPage() {
  const user = await requireUser("record_expenses");
  const categories = await listCategories(user.accountId);
  return (
    <>
      <h1>Expense categories</h1>
      <p className="small muted">Disabled categories are hidden when adding expenses but kept on past ones. Mark purchases of equipment or vehicles as capital assets.</p>
      <NewNamedItem save={saveCategoryAction.bind(null, null)} flags={FLAGS} placeholder="New category name" />
      <div className="panel">
        {categories.map((c) => (
          <div key={c.id} className="exp-item-wrap">
            <NamedItemRow save={saveCategoryAction.bind(null, c.id)} remove={deleteCategoryAction.bind(null, c.id)} d={c} flags={FLAGS} />
            <Link className="small" href={`/expenses?f=c:${c.id}&unit=`}>Expenses</Link>
          </div>
        ))}
        {categories.length === 0 && <p className="muted">No categories yet. Add one above or while recording an expense.</p>}
      </div>
    </>
  );
}
