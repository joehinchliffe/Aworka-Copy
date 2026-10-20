"use client";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <div className="auth-wrap">
      <form action={action} className="panel auth-card">
        <h1>Log in</h1>
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
