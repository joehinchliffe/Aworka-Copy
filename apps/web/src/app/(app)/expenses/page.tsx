import Link from "next/link";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { EXPENSE_METHOD_LABELS, EXPENSE_VAT_LABELS, PERIOD_UNIT_LABELS, type ExpensePeriodUnit } from "@/lib/expenseOptions";
import {
  generateDueRecurringExpenses, listCategories, listExpenses, listSuppliers, periodRange, type ExpenseFilter,
} from "@/lib/services/expenses";

type SP = Record<string, string | undefined>;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("record_expenses");
  const sp = await searchParams;
  const today = todayIso();
  // Recurring expenses that fell due since the last visit are added before listing.
  await generateDueRecurringExpenses(user.accountId, today, { userId: user.id });

  const n = Math.max(1, Number(sp.n) || 3);
  const unit = (sp.unit ?? "month") as ExpensePeriodUnit | "";
  const anchor = sp.anchor === "starting" ? "starting" : "ending";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const range = unit ? periodRange({ num: n, unit, anchor, date }) : null;
  const who = sp.f ?? "";
  const f: ExpenseFilter = {
    categoryId: who.startsWith("c:") ? who.slice(2) : undefined,
    supplierId: who.startsWith("s:") ? who.slice(2) : undefined,
    method: sp.method || undefined,
    from: range?.from, to: range?.to,
    amountNotSet: sp.unset === "1",
  };
  const [{ rows, totals }, categories, suppliers] = await Promise.all([
    listExpenses(user.accountId, f), listCategories(user.accountId), listSuppliers(user.accountId),
  ]);

  return (
    <>
      <div className="spread">
        <h1>Expenses</h1>
        <div className="row no-print">
          <Link className="btn primary" href="/expenses/new">New expense</Link>
        </div>
      </div>
      <form className="panel no-print exp-filters" style={{ marginBottom: 12 }}>
        <select name="f" defaultValue={who} aria-label="Category or supplier">
          <option value="">All categories and suppliers</option>
          <optgroup label="Categories">{categories.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>
          {suppliers.length > 0 && <optgroup label="Suppliers">{suppliers.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.name}</option>)}</optgroup>}
        </select>
        <select name="method" defaultValue={sp.method ?? ""} aria-label="Paid by">
          <option value="">Any payment method</option>
          {Object.entries(EXPENSE_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="row exp-period">
          <input name="n" type="number" min={1} defaultValue={n} aria-label="Number of periods" style={{ width: 70 }} />
          <select name="unit" defaultValue={unit} aria-label="Period">
            {Object.entries(PERIOD_UNIT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="">all time</option>
          </select>
          <select name="anchor" defaultValue={anchor} aria-label="Starting or ending">
            <option value="ending">ending</option><option value="starting">starting</option>
          </select>
          <input name="date" type="date" defaultValue={date} aria-label="Date" style={{ width: 160 }} />
        </span>
        <label className="row" style={{ margin: 0 }}><input type="checkbox" name="unset" value="1" defaultChecked={f.amountNotSet} /> Amount not set</label>
        <button className="btn">Show</button>
      </form>
      {range && <p className="small muted">{formatDate(range.from)} to {formatDate(range.to)}</p>}

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="label">Expenses</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">Total spent</div><div className="value">{money(totals.amount)}</div></div>
        <div className="stat"><div className="label">Reclaimable VAT</div><div className="value">{money(totals.reclaimableVat)}</div></div>
        <div className="stat"><div className="label">Allowable for income tax</div><div className="value">{money(totals.allowable)}</div></div>
      </div>
      {totals.amountNotSet > 0 && !f.amountNotSet && (
        <div className="notice exp-warn">
          {totals.amountNotSet} expense{totals.amountNotSet === 1 ? " has" : "s have"} no amount yet. <Link href="/expenses?unset=1&unit=">Show them</Link>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Supplier</th><th>Description</th><th>Paid by</th><th>VAT</th><th className="num">Amount</th><th className="num">Reclaimable VAT</th><th className="num">Allowable</th></tr></thead>
          <tbody>
            {rows.map(({ expense: e, category, supplier }) => (
              <tr key={e.id}>
                <td><Link href={`/expenses/${e.id}`}>{formatDate(e.date)}</Link></td>
                <td>{category}</td>
                <td>{supplier}</td>
                <td>
                  {e.description}{e.reference && <span className="muted small"> · {e.reference}</span>}
                  {e.recurringExpenseId && <> <span className="badge info">recurring</span></>}
                </td>
                <td>{e.method ? EXPENSE_METHOD_LABELS[e.method as keyof typeof EXPENSE_METHOD_LABELS] ?? e.method : ""}</td>
                <td className="small">{EXPENSE_VAT_LABELS[e.vatStatus as keyof typeof EXPENSE_VAT_LABELS] ?? e.vatStatus}</td>
                <td className="num">{e.amount == null ? <span className="badge warn">to add</span> : money(e.amount)}</td>
                <td className="num">{money(e.reclaimableVat)}</td>
                <td className="num">{money(e.allowable)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">No expenses for this selection.</td></tr>}
          </tbody>
          <tfoot><tr><th colSpan={6}>Total ({rows.length})</th><th className="num">{money(totals.amount)}</th><th className="num">{money(totals.reclaimableVat)}</th><th className="num">{money(totals.allowable)}</th></tr></tfoot>
        </table>
      </div>
    </>
  );
}
