import Link from "next/link";
import { addMonths } from "@rounds/domain";
import { incomeForecast, monthEnd, taxYear } from "@/lib/services/reports";
import { accountFor } from "@/lib/lookups";
import { requireUser } from "@/lib/session";
import { money } from "@/lib/format";
import { formatDate, todayIso } from "@/lib/time";
import { PrintButton } from "../PrintButton";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const user = await requireUser("view_reports");
  const sp = await searchParams;
  const account = await accountFor(user.accountId);
  if (!account) throw new Error("Account not found");
  const today = todayIso();
  const tyEnd = taxYear(account, today).end;
  const next12 = monthEnd(addMonths(today, 11));
  const start = sp.start && ISO.test(sp.start) ? sp.start : today;
  let end = sp.end && ISO.test(sp.end) ? sp.end : tyEnd;
  if (end < start) end = start;
  const f = await incomeForecast(user.accountId, start, end);

  return (
    <>
      <div className="spread"><h1>Income forecast</h1><PrintButton /></div>
      <p className="muted">
        Value of regular work projected from each job&apos;s next due date, {formatDate(start)} to {formatDate(end)}{account.collectsVat ? ", less VAT" : ""}.
      </p>
      <form className="row no-print report-filters" style={{ marginBottom: 12 }}>
        <div><label htmlFor="start">From</label><input id="start" type="date" name="start" defaultValue={start} /></div>
        <div><label htmlFor="end">To</label><input id="end" type="date" name="end" defaultValue={end} /></div>
        <button className="btn">Show</button>
        <div className="report-presets">
          <Link href={`/reports/forecast?${new URLSearchParams({ start: today, end: tyEnd })}`}>To tax year end</Link>
          <Link href={`/reports/forecast?${new URLSearchParams({ start: today, end: next12 })}`}>Next 12 months</Link>
        </div>
      </form>
      <div className="table-wrap"><table>
        <thead><tr><th>Round</th>{f.months.map((m) => <th key={m.key} className="num">{m.label}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {f.rows.map((r) => (
            <tr key={r.roundId ?? "none"}>
              <td>{r.name}</td>{r.values.map((v, i) => <td key={i} className="num">{v ? money(v) : "–"}</td>)}<td className="num">{money(r.total)}</td>
            </tr>
          ))}
          {f.rows.length === 0 && <tr><td colSpan={f.months.length + 2} className="muted">No regular work is due in this period.</td></tr>}
        </tbody>
        <tfoot><tr><th>Total</th>{f.totals.map((v, i) => <th key={i} className="num">{money(v)}</th>)}<th className="num">{money(f.total)}</th></tr></tfoot>
      </table></div>
    </>
  );
}
