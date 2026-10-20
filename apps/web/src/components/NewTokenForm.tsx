"use client";
import { useActionState } from "react";

export function NewTokenForm({ action }: { action: (s: { token?: string } | undefined, f: FormData) => Promise<{ token?: string }> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="row">
      <input name="label" placeholder="What is it for?" style={{ maxWidth: 260 }} required />
      <button className="btn primary" disabled={pending}>Create token</button>
      {state?.token && <div className="notice ok" style={{ width: "100%" }}>Copy this token now. It will not be shown again:<br /><code>{state.token}</code></div>}
    </form>
  );
}
