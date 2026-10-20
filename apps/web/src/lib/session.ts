import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@rounds/domain";
import { SESSION_COOKIE, userForToken, type CurrentUser } from "./auth";

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(token);
});

export async function requireUser(permission?: Permission): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (permission && !user.permissions.has(permission) && !user.permissions.has("administrator")) {
    throw new Error("You do not have permission to do that");
  }
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}
