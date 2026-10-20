"use client";
import Link from "next/link";
import { useActionState, useState } from "react";

type DraftState = { errors?: string[]; created?: number; skipped?: { customerId: string; name: string; reason: string }[] } | undefined;
type Action = (state: DraftState, f: FormData) => Promise<DraftState>;

export interface DraftBuilderProps {
  action: Action;
  rounds: { id: string; name: string }[];
  templates: { id: string; name: string; purpose: string; hasEmail: boolean; hasSms: boolean }[];
  users: { id: string; name: string }[];
  statuses: Record<string, string>;
  purposes: Record<string, string>;
  d: { source: string; start: string; days: number; status: string; user: string };
}

export function DraftBuilder({ action, rounds, templates, users, statuses, purposes, d }: DraftBuilderProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [source, setSource] = useState(d.source);
  return (
    <>
      {state?.errors && <div className="notice error">{state.errors.join(". ")}</div>}
      {state?.created !== undefined && (
        <div className="notice ok">
          {state.created} draft{state.created === 1 ? "" : "s"} created. <Link href="/messages/drafts">Review and deliver drafts</Link>
        </div>
      )}
      {state?.skipped && state.skipped.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>Not drafted ({state.skipped.length})</h3>
          <ul className="small">
            {state.skipped.map((s) => <li key={s.customerId}><Link href={`/customers/${s.customerId}`}>{s.name}</Link>: {s.reason}</li>)}
          </ul>
        </div>
      )}
      <form action={formAction} className="panel" style={{ maxWidth: 820 }}>
        <fieldset>
          <legend>Who to message</legend>
          {[
            ["job_sheet", "Customers with jobs on a job sheet"],
            ["round", "Customers in a round"],
            ["debt", "Customers in debt"],
          ].map(([v, l]) => (
            <label key={v} className="row" style={{ margin: "4px 0" }}>
              <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v!)} /> {l}
            </label>
          ))}
          {source === "round" && (
            <><label>Round</label>
              <select name="roundId" defaultValue="" required>
                <option value="" disabled>Choose a round</option>
                {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></>
          )}
          {source === "job_sheet" && (
            <div className="field-row">
              <div><label>Jobs</label>
                <select name="status" defaultValue={d.status}>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label>Starting</label><input type="date" name="start" defaultValue={d.start} required /></div>
              <div><label>Days</label>
                <select name="days" defaultValue={d.days}>{Array.from({ length: 14 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
              <div><label>User</label>
                <select name="user" defaultValue={d.user}>
                  <option value="all">Everyone</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select></div>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>What to send</legend>
          {templates.length === 0 ? (
            <p className="small">You need a template first. <Link href="/messages/templates/new">Create a template</Link></p>
          ) : (
            <div className="field-row">
              <div><label>Template</label>
                <select name="templateId" defaultValue="" required>
                  <option value="" disabled>Choose a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({purposes[t.purpose] ?? t.purpose}{!t.hasEmail ? ", SMS only" : !t.hasSms ? ", email only" : ""})</option>
                  ))}
                </select></div>
              <div><label>Send by</label>
                <select name="channel" defaultValue="preferred">
                  <option value="preferred">Each customer&apos;s contact method</option>
                  <option value="email">Email only</option>
                  <option value="sms">SMS only</option>
                </select></div>
            </div>
          )}
          <p className="small muted">Customers whose contact method is none, who prefer the other channel, who have no email or phone, or who opted out of marketing (for marketing templates) are skipped.</p>
        </fieldset>
        <button className="btn primary" disabled={pending || templates.length === 0}>Create drafts</button>
      </form>
    </>
  );
}
