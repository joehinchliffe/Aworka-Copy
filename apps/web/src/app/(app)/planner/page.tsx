import Link from "next/link";
import { addDays, addMonths, weekday } from "@rounds/domain";
import { PlannerGrid, type PlannerDay } from "@/components/PlannerGrid";
import { plannerRange } from "@/lib/services/planning";
import { requireUser } from "@/lib/session";
import { roundsFor, accountFor } from "@/lib/lookups";
import { todayIso } from "@/lib/time";
import { moveJobAction, planProjectedAction } from "./actions";

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ month?: string; round?: string; future?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIso();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const first = `${month}-01`;
  const gridStart = addDays(first, -weekday(first));
  const last = addDays(addMonths(first, 1), -1);
  const gridEnd = addDays(last, 6 - weekday(last));
  const showFuture = sp.future !== "0";
  const [byDate, rounds, account] = await Promise.all([
    plannerRange(user.accountId, gridStart, gridEnd, { showFuture, roundId: sp.round || undefined }),
    roundsFor(user.accountId), accountFor(user.accountId),
  ]);
  const daysWorked = account?.settings.daysWorked ?? 127;
  const days: PlannerDay[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    days.push({ date: d, inMonth: d.startsWith(month), isToday: d === today, worked: (daysWorked & (1 << weekday(d))) !== 0, jobs: byDate.get(d) ?? [] });
  }
  const weeks: PlannerDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const label = new Date(first + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const q = (m: string) => `/planner?month=${m}${sp.round ? `&round=${sp.round}` : ""}${showFuture ? "" : "&future=0"}`;
  const monthTotal = days.filter((d) => d.inMonth).flatMap((d) => d.jobs).filter((j) => !j.projected).reduce((s, j) => s + j.gross, 0);
  return (
    <>
      <div className="spread">
        <h1>Planner · {label}</h1>
        <div className="row no-print">
          <Link className="btn" href={q(addMonths(first, -1).slice(0, 7))}>‹ Prev</Link>
          <Link className="btn" href={q(today.slice(0, 7))}>Today</Link>
          <Link className="btn" href={q(addMonths(first, 1).slice(0, 7))}>Next ›</Link>
          <Link className="btn primary" href={`/planner/day/${today}`}>Today's jobs</Link>
        </div>
      </div>
      <form className="row no-print" style={{ marginBottom: 8 }}>
        <input type="hidden" name="month" value={month} />
        <select name="round" defaultValue={sp.round ?? ""} style={{ maxWidth: 200 }}>
          <option value="">All rounds</option>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select name="future" defaultValue={showFuture ? "1" : "0"} style={{ maxWidth: 200 }}>
          <option value="1">Show future jobs</option><option value="0">Planned jobs only</option>
        </select>
        <button className="btn">Show</button>
        <span className="small muted">Planned this month: £{(monthTotal / 100).toFixed(2)}. Drag jobs between days; dashed jobs are projected from their frequency.</span>
      </form>
      <PlannerGrid weeks={weeks} move={moveJobAction} planProjected={planProjectedAction} canMove={user.permissions.has("move_jobs")} />
    </>
  );
}
