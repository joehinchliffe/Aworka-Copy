"use client";
import { useActionState } from "react";

type FormState = { errors?: string[] } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

export interface EventDefaults { type?: string; date: string; time?: string | null; summary?: string; details?: string | null }

export function EventForm({ action, d, submitLabel = "Save" }: { action: Action; d: EventDefaults; submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      {state?.errors && <div className="notice error">{state.errors.join(". ")}</div>}
      <div className="field-row">
        <div><label>Type</label>
          <select name="type" defaultValue={d.type === "event" ? "event" : d.type ? "to_do" : "event"}>
            <option value="event">Event</option><option value="to_do">To do</option>
          </select></div>
        <div><label>When</label><input type="date" name="date" defaultValue={d.date} required /></div>
        <div><label>At</label><input type="time" name="time" defaultValue={d.time ?? ""} /></div>
      </div>
      <label>Summary</label><input name="summary" defaultValue={d.summary ?? ""} required maxLength={200} />
      <label>Details</label><textarea name="details" defaultValue={d.details ?? ""} />
      <div className="row" style={{ marginTop: 8 }}><button className="btn primary" disabled={pending}>{submitLabel}</button></div>
    </form>
  );
}
