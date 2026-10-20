"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { PlannerJob } from "@/lib/services/planning";

export interface PlannerDay { date: string; inMonth: boolean; isToday: boolean; worked: boolean; jobs: PlannerJob[] }

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  to_do: { bg: "#e8eefc", fg: "#1d3a8a", label: "To do" },
  done: { bg: "#e7f6ee", fg: "#067647", label: "Done" },
  not_done: { bg: "#fdecea", fg: "#b42318", label: "Not done" },
  skipped: { bg: "#f2f4f7", fg: "#5f6b7d", label: "Skipped" },
  estimate: { bg: "#fff4e5", fg: "#b54708", label: "Estimate" },
};

export function PlannerGrid({ weeks, move, planProjected, canMove }: {
  weeks: PlannerDay[][];
  move: (jobId: string, date: string) => Promise<void>;
  planProjected: (specId: string, date: string) => Promise<void>;
  canMove: boolean;
}) {
  const [pending, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onDrop(date: string, e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const [kind, id] = data.split("|") as [string, string];
    start(async () => {
      try {
        setError(null);
        if (kind === "job") await move(id, date);
        else await planProjected(id, date);
      } catch (err) { setError(err instanceof Error ? err.message : "Could not move job"); }
    });
  }

  return (
    <>
      {error && <div className="notice error">{error}</div>}
      <div className="planner" style={{ opacity: pending ? 0.6 : 1 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="planner-head">{d}</div>)}
        {weeks.flat().map((day) => {
          const total = day.jobs.reduce((s, j) => s + (j.projected ? 0 : j.gross), 0);
          const mins = day.jobs.reduce((s, j) => s + (j.projected ? 0 : j.timeRequired), 0);
          return (
            <div key={day.date}
              className={`planner-day${day.inMonth ? "" : " out"}${day.isToday ? " today" : ""}${day.worked ? "" : " off"}${over === day.date ? " over" : ""}`}
              onDragOver={(e) => { if (canMove) { e.preventDefault(); setOver(day.date); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => onDrop(day.date, e)}>
              <div className="spread small">
                <Link href={`/planner/day/${day.date}`}><strong>{Number(day.date.slice(8))}</strong></Link>
                {total > 0 && <span className="muted">£{(total / 100).toFixed(0)} · {Math.floor(mins / 60)}h{String(mins % 60).padStart(2, "0")}</span>}
              </div>
              {day.jobs.map((j) => {
                const st = STATUS_STYLE[j.status] ?? STATUS_STYLE.to_do!;
                return (
                  <div key={j.id} draggable={canMove && (j.projected || j.status === "to_do" || j.status === "estimate")}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", j.projected ? `spec|${j.jobSpecId}` : `job|${j.id}`)}
                    className={`chip${j.projected ? " projected" : ""}${j.allowed ? "" : " not-allowed"}`}
                    style={{ background: j.projected ? "transparent" : st.bg, color: st.fg, minHeight: Math.max(18, Math.min(60, j.timeRequired / 2)) }}
                    title={`${j.name} — ${j.customerName}${j.roundName ? ` (${j.roundName})` : ""} · £${(j.gross / 100).toFixed(2)} · ${st.label}${j.allowed ? "" : " · not allowed on this day"}`}>
                    {j.paid && <span aria-label="paid">£ </span>}
                    {j.apptType === "first" && <span className="badge info" style={{ padding: "0 4px" }}>new</span>} {j.name}
                    {j.confirmed === false && <span title="Not confirmed"> ?</span>}
                  </div>
                );
              })}
              <Link href={`/planner/day/${day.date}`} className="add no-print" aria-label={`Plan jobs for ${day.date}`}>+</Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
