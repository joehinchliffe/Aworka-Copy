"use client";
import { useActionState } from "react";

type FormState = { errors?: string[]; ok?: string } | undefined;
type Action = (state: FormState, f: FormData) => Promise<FormState>;

/** A form bound to a server action that reports validation errors and a saved message inline. */
export function ActionForm({ action, submitLabel = "Save", children, className, danger, confirm }: {
  action: Action;
  submitLabel?: string;
  children?: React.ReactNode;
  className?: string;
  danger?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}
      onSubmit={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}>
      {state?.errors?.length ? <div className="notice error">{state.errors.map((e) => <div key={e}>{e}</div>)}</div> : null}
      {state?.ok ? <div className="notice ok">{state.ok}</div> : null}
      {children}
      <div className="row" style={{ marginTop: 10 }}>
        <button className={`btn ${danger ? "danger" : "primary"}`} disabled={pending}>{pending ? "Saving..." : submitLabel}</button>
      </div>
    </form>
  );
}
