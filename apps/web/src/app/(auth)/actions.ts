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
  redirect(safeNext(form.get("next")) ?? "/planner");
}

/** Only same-site relative paths, so the login page cannot be used as an open redirect. */
function safeNext(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f]/.test(s)) return null;
  return s;
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
