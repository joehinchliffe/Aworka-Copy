"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession, login, signup, SESSION_COOKIE } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!user) return { error: "Email or password is incorrect" };
  const s = await createSession(user.id);
  await setSessionCookie(s.token, s.expiresAt);
  redirect("/planner");
}

export async function signupAction(_: FormState, form: FormData): Promise<FormState> {
  try {
    const { user } = await signup({
      businessName: String(form.get("businessName") ?? "").trim(),
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    const s = await createSession(user.id);
    await setSessionCookie(s.token, s.expiresAt);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the account" };
  }
  redirect("/customers/new");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
