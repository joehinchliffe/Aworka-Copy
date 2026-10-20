import Link from "next/link";
import { diffDays } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { formatDate, todayIso } from "@/lib/time";
import { listTimeOff, timeOffReasons } from "@/lib/services/calendar";
import { PeriodFields, readPeriod } from "@/components/PeriodFields";
import { TimeOffForm } from "@/components/TimeOffForm";
import { addTimeOffAction, deleteTimeOffAction } from "./actions";

export default async function TimeOffPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const period = readPeriod(sp, { num: 1, unit: "year", anchor: "starting", date: today });
  const [rows, reasons] = await Promise.all([listTimeOff(user.accountId, period.start, period.end), timeOffReasons(user.accountId)]);
  const canBook = user.permissions.has("book_time_off") || user.permissions.has("administrator");
  return (
    <>
      <h1>Time off</h1>
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <PeriodFields p={period} />
        <button className="btn">Refresh</button>
        <Link className="small" href="/time-off">Reset</Link>
      </form>
      <div className="grid cols-2">
        <div className="table-wrap" style={{ alignSelf: "start" }}>
          <table>
            <thead><tr><th>From</th><th>To</th><th className="num">Days</th><th>Reason</th><th>Who</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ holiday: h, userName }) => (
                <tr key={h.id}>
                  <td>{formatDate(h.startOn)}</td>
                  <td>{formatDate(h.endOn)}</td>
                  <td className="num">{diffDays(h.startOn, h.endOn) + 1}</td>
                  <td>{h.reason ?? ""}{h.notes && <div className="small muted">{h.notes}</div>}</td>
                  <td className="small">{userName ?? "Everyone"}</td>
                  <td className="num">{canBook && <form action={deleteTimeOffAction.bind(null, h.id)}><button className="btn small danger">Delete</button></form>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="muted">There are no matching periods of time off.</td></tr>}
            </tbody>
          </table>
        </div>
        {canBook && (
          <section className="panel" style={{ alignSelf: "start" }}>
            <h2 style={{ marginTop: 0 }}>New time off</h2>
            <TimeOffForm action={addTimeOffAction} today={today} reasons={reasons} />
          </section>
        )}
      </div>
    </>
  );
}
