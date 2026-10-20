"use client";
import { useActionState } from "react";
import { FraudFacts } from "./FraudFacts";

type State = { ok?: string; error?: string } | undefined;
export function SubmitToHmrc({ action, hidden, label }: { action: (s: State, f: FormData) => Promise<State>; hidden: Record<string, string>; label: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="row">
      <FraudFacts />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className="btn primary" disabled={pending}>{pending ? "Submitting…" : label}</button>
      {state?.ok && <span className="badge ok">{state.ok}</span>}
      {state?.error && <span className="badge danger">{state.error}</span>}
    </form>
  );
}
