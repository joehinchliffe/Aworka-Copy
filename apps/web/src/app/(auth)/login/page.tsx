"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { loginAction } from "../actions";

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

function LoginForm() {
  const next = useSearchParams().get("next");
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="auth-wrap">
      <form action={action} className="panel auth-card">
        <h1>Log in</h1>
        {next && <input type="hidden" name="next" value={next} />}
        {state?.error && <div className="notice error">{state.error}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <p><button className="btn primary" disabled={pending}>Log in</button></p>
        <p className="small muted">New here? <Link href="/signup">Start a free 6-week trial</Link></p>
      </form>
    </div>
  );
}
