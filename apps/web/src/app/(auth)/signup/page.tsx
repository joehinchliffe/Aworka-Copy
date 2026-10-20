"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <div className="auth-wrap">
      <form action={action} className="panel auth-card">
        <h1>Start your free trial</h1>
        <p className="small muted">Six weeks free. No card needed.</p>
        {state?.error && <div className="notice error">{state.error}</div>}
        <label htmlFor="businessName">Business name</label>
        <input id="businessName" name="businessName" required />
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password (8+ characters)</label>
        <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required />
        <p><button className="btn primary" disabled={pending}>Create account</button></p>
        <p className="small muted">Already have an account? <Link href="/login">Log in</Link></p>
      </form>
    </div>
  );
}
