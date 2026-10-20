"use client";
import { useActionState } from "react";

type FormState = { errors?: string[]; ok?: boolean; savedAt?: number } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

export function TimeOffForm({ action, today, reasons }: { action: Action; today: string; reasons: string[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} key={state?.savedAt ?? "form"}>
      {state?.errors && <div className="notice error">{state.errors.join(". ")}</div>}
      {state?.ok && <div className="notice ok">Time off saved.</div>}
      <div className="field-row">
        <div><label>From</label><input type="date" name="startOn" defaultValue={today} required /></div>
        <div><label>To</label><input type="date" name="endOn" defaultValue={today} required /></div>
      </div>
      <label>Reason</label>
      <input name="reason" list="time-off-reasons" placeholder="e.g. Holiday, Sick, Training" maxLength={60} />
      <datalist id="time-off-reasons">{reasons.map((r) => <option key={r} value={r} />)}</datalist>
      <label>Notes</label><textarea name="notes" />
      <div className="row" style={{ marginTop: 8 }}><button className="btn primary" disabled={pending}>Save</button></div>
    </form>
  );
}
