import Link from "next/link";
import { requireUser } from "@/lib/session";
import { formatDay, todayIso } from "@/lib/time";
import { EVENT_FILTERS, listEvents, type EventFilter } from "@/lib/services/calendar";
import { PeriodFields, readPeriod } from "@/components/PeriodFields";
import { EventForm } from "@/components/EventForm";
import { saveEventAction, toggleToDoAction } from "./actions";

const TYPE_BADGE: Record<string, { text: string; cls: string }> = {
  event: { text: "Event", cls: "info" }, to_do: { text: "To do", cls: "warn" }, done_to_do: { text: "Done", cls: "ok" },
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const filter = (sp.filter && sp.filter in EVENT_FILTERS ? sp.filter : "all") as EventFilter;
  const period = readPeriod(sp, { num: 1, unit: "month", anchor: "starting", date: today });
  const rows = await listEvents(user.accountId, { filter, start: period.start, end: period.end });
  const canEdit = user.permissions.has("create_events") || user.permissions.has("administrator");
  return (
    <>
      <h1>Events</h1>
      <form className="row panel no-print" style={{ marginBottom: 12 }}>
        <select name="filter" defaultValue={filter} style={{ maxWidth: 150 }} aria-label="Show">
          {Object.entries(EVENT_FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <PeriodFields p={period} />
        <button className="btn">Refresh</button>
        <Link className="small" href="/events">Reset</Link>
      </form>
      <div className="grid cols-2">
        <div className="table-wrap" style={{ alignSelf: "start" }}>
          <table>
            <thead><tr><th>When</th><th>Summary</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const b = TYPE_BADGE[e.type] ?? TYPE_BADGE.event!;
                return (
                  <tr key={e.id} className={e.type === "done_to_do" ? "muted" : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatDay(e.date)}{e.time ? ` ${e.time}` : ""}
                      {e.type === "to_do" && e.date < today && <div><span className="badge danger">overdue</span></div>}</td>
                    <td><span className={`badge ${b.cls}`}>{b.text}</span>{" "}
                      {canEdit ? <Link href={`/events/${e.id}`}>{e.summary}</Link> : e.summary}
                      {e.details && <div className="small muted" style={{ whiteSpace: "pre-line" }}>{e.details}</div>}</td>
                    <td className="num">
                      {canEdit && e.type !== "event" && (
                        <form action={toggleToDoAction.bind(null, e.id, e.type === "to_do")}>
                          <button className="btn small">{e.type === "to_do" ? "Mark done" : "Reopen"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={3} className="muted">There are no matching events.</td></tr>}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <section className="panel" style={{ alignSelf: "start" }}>
            <h2 style={{ marginTop: 0 }}>New event or to do</h2>
            <EventForm action={saveEventAction.bind(null, null)} d={{ date: today }} submitLabel="Add" />
          </section>
        )}
      </div>
    </>
  );
}
