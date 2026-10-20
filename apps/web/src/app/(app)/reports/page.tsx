import Link from "next/link";
import { can } from "@rounds/domain";
import { profitAndLoss, type PnlRow } from "@/lib/services/reports";
import { accountFor } from "@/lib/lookups";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { PrintButton } from "./PrintButton";
import { PNL_PRESETS, pnlParams } from "./params";

function Line({ row, cls }: { row: PnlRow; cls?: string }) {
  return (
    <tr className={cls}>
      <td>{row.label}</td>
      {row.values.map((v, i) => <td key={i} className={`num ${v < 0 ? "debt" : ""}`}>{v ? money(v) : "–"}</td>)}
      <td className={`num ${row.total < 0 ? "debt" : ""}`}>{money(row.total)}</td>
    </tr>
  );
}

function Section({ title, width }: { title: string; width: number }) {
  return <tr className="pnl-section"><th colSpan={width + 2}>{title}</th></tr>;
}

export default async function ProfitAndLossPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("view_reports");
  const sp = await searchParams;
  const account = await accountFor(user.accountId);
  if (!account) throw new Error("Account not found");
  const today = todayIso();
  const { start, end, basis, groupBy } = pnlParams(account, sp, today);
  const p = await profitAndLoss(user.accountId, start, end, basis, groupBy);
  const width = p.columns.length;
  const exportQs = new URLSearchParams({ type: "pnl", start, end, basis, group: groupBy }).toString();

  return (
    <>
      <div className="spread">
        <h1>Profit and loss</h1>
        <div className="row no-print">
          {can(user.permissions, "export_reports") && <a className="btn" href={`/reports/export?${exportQs}`}>Download CSV</a>}
          <PrintButton />
        </div>
      </div>
      <p className="muted">
        {account.businessName} · {formatDate(start)} to {formatDate(end)} · {basis === "cash" ? "Cash basis" : "Accrual basis"}
      </p>

      <form className="panel row no-print report-filters">
        <div><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={start} /></div>
        <div><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={end} /></div>
        <div>
          <label htmlFor="basis">Basis</label>
          <select id="basis" name="basis" defaultValue={basis}><option value="accrual">Accrual (work done)</option><option value="cash">Cash (money received)</option></select>
        </div>
        <div>
          <label htmlFor="group">Columns</label>
          <select id="group" name="group" defaultValue={groupBy}><option value="month">By month</option><option value="round">By round</option></select>
        </div>
        <button className="btn primary">Show</button>
        <div className="report-presets">
          {Object.entries(PNL_PRESETS).map(([k, label]) => (
            <Link key={k} href={`/reports?${new URLSearchParams({ preset: k, basis, group: groupBy })}`}>{label}</Link>
          ))}
        </div>
      </form>

      <div className="table-wrap pnl">
        <table>
          <thead>
            <tr><th></th>{p.columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}<th className="num">Total</th></tr>
          </thead>
          <tbody>
            <Section title={basis === "cash" ? "Net sales (received, ex VAT)" : "Net sales (work done, ex VAT)"} width={width} />
            {p.netSales.map((r) => <Line key={r.label} row={r} />)}
            <Line row={p.netSalesTotal} cls="pnl-total" />

            <Section title="Gross income" width={width} />
            {p.grossIncome.map((r) => <Line key={r.label} row={r} />)}
            <Line row={p.grossIncomeTotal} cls="pnl-total" />

            <Section title={basis === "cash" ? "Bad debt (not deducted on cash basis)" : "Bad debt"} width={width} />
            <Line row={p.badDebt} />

            <Section title="Net expenses (ex reclaimable VAT)" width={width} />
            {p.expenses.map((r) => <Line key={r.label} row={r} />)}
            {p.expenses.length === 0 && <tr><td colSpan={width + 2} className="muted">No expenses in this period.</td></tr>}
            <Line row={p.expensesTotal} cls="pnl-total" />

            {p.capitalAssets.length > 0 && <>
              <Section title="Capital assets (not deducted)" width={width} />
              {p.capitalAssets.map((r) => <Line key={r.label} row={r} />)}
            </>}
          </tbody>
          <tfoot><Line row={p.profit} cls="pnl-profit" /></tfoot>
        </table>
      </div>
      <p className="small muted">
        Profit before tax = net sales + tips{basis === "accrual" ? " − bad debt" : ""} − net expenses. Overpayments kept by the business count as tips.
      </p>
    </>
  );
}
