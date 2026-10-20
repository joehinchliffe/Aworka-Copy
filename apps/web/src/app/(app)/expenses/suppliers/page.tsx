import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listSuppliers } from "@/lib/services/expenses";
import { deleteSupplierAction, saveSupplierAction } from "../actions";
import { NamedItemRow, NewNamedItem } from "../forms";

const FLAGS = [{ name: "otherEcState", label: "From another EC state" }];

export default async function SuppliersPage() {
  const user = await requireUser("record_expenses");
  const suppliers = await listSuppliers(user.accountId);
  return (
    <>
      <h1>Suppliers</h1>
      <p className="small muted">Disabled suppliers are hidden when adding expenses but kept on past ones.</p>
      <NewNamedItem save={saveSupplierAction.bind(null, null)} flags={FLAGS} placeholder="New supplier name" />
      <div className="panel">
        {suppliers.map((s) => (
          <div key={s.id} className="exp-item-wrap">
            <NamedItemRow save={saveSupplierAction.bind(null, s.id)} remove={deleteSupplierAction.bind(null, s.id)} d={s} flags={FLAGS} />
            <Link className="small" href={`/expenses?f=s:${s.id}&unit=`}>Expenses</Link>
          </div>
        ))}
        {suppliers.length === 0 && <p className="muted">No suppliers yet. Add one above or while recording an expense.</p>}
      </div>
    </>
  );
}
