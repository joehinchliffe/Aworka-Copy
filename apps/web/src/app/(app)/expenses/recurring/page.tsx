import Link from "next/link";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { PERIOD_UNIT_LABELS, type ExpensePeriodUnit } from "@/lib/expenseOptions";
import { listRecurring } from "@/lib/services/expenses";

function everyLabel(num: number, unit: string) {
  if (num === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[unit] ?? unit;
  return `Every ${num} ${PERIOD_UNIT_LABELS[unit as ExpensePeriodUnit] ?? unit}`;
}

function untilLabel(r: { schedule: string; endOn: string | null; remainingCount: number | null; totalLimit: number | null; totalSoFar: number }) {
  if (r.schedule === "count") return `${r.remainingCount ?? 0} payment${r.remainingCount === 1 ? "" : "s"} left`;
  if (r.schedule === "until_date") return `until ${formatDate(r.endOn)}`;
  if (r.schedule === "until_total") return `${money(r.totalSoFar)} of ${money(r.totalLimit)}`;
  return "forever";
}

export default async function RecurringPage() {
  const user = await requireUser("record_expenses");
  const rows = await listRecurring(user.accountId);
  return (
    <>
      <div className="spread">
        <h1>Recurring expenses</h1>
        <Link className="btn primary" href="/expenses/recurring/new">New recurring expense</Link>
      </div>
      <p className="small muted">Each payment is added to your expenses on its due date.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>Supplier</th><th>Description</th><th>Repeats</th><th>Continues</th><th>Next due</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {rows.map(({ recurring: r, category, supplier, active }) => (
              <tr key={r.id}>
                <td><Link href={`/expenses/recurring/${r.id}`}>{category}</Link></td>
                <td>{supplier}</td>
                <td>{r.description}</td>
                <td>{everyLabel(r.everyNum, r.everyUnit)}</td>
                <td>{untilLabel(r)}</td>
                <td>{active ? formatDate(r.nextDueOn) : <span className="badge">finished</span>}</td>
                <td className="num">{r.amount == null ? <span className="badge warn">to add</span> : money(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No recurring expenses yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
