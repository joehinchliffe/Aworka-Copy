import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, sql } from "drizzle-orm";
import { RolePresets, Permissions, type Permission } from "@rounds/domain";
import { db, schema } from "@/db";
import { addDays, todayIso } from "./time";

export const SESSION_COOKIE = "rounds_session";
const SESSION_DAYS = 30;

export const hashPassword = (pw: string) => hash(pw);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);
const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SignupInput {
  businessName: string;
  name: string;
  email: string;
  password: string;
}

/** Create an account with its owner user, default roles and a 6-week trial. */
export async function signup(input: SignupInput) {
  if (input.password.length < 8) throw new Error("Password must be at least 8 characters");
  const existing = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = lower(${input.email})`,
  });
  if (existing) throw new Error("An account with that email already exists");
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [account] = await tx.insert(schema.accounts).values({
      businessName: input.businessName,
      trialEndsOn: addDays(todayIso(), 42),
      settings: { defaultPaid: "job_price", autoMarkPolicy: "assume_not_done", autoMarkAfterDays: 7, daysWorked: 62 },
    }).returning();
    await tx.insert(schema.roles).values([
      { accountId: account!.id, name: "Franchisee", permissions: [...RolePresets.franchisee] },
      { accountId: account!.id, name: "Employee", permissions: [...RolePresets.employee] },
    ]);
    const [user] = await tx.insert(schema.users).values({
      accountId: account!.id, email: input.email.trim(), passwordHash, name: input.name, isOwner: true,
    }).returning();
    return { account: account!, user: user! };
  });
}

export async function login(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: sql`lower(${schema.users.email}) = lower(${email.trim()})`,
  });
  if (!user || !(await verifyPassword(user.passwordHash, password))) return null;
  return user;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ id: tokenId(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, tokenId(token)));
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  accountId: string;
  businessName: string;
  permissions: ReadonlySet<Permission>;
}

export async function userForToken(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  const row = await db
    .select({ user: schema.users, account: schema.accounts, role: schema.roles })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.users.accountId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.sessions.id, tokenId(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const r = row[0];
  if (!r) return null;
  const permissions: ReadonlySet<Permission> = r.user.isOwner
    ? new Set(Permissions)
    : new Set((r.role?.permissions ?? []) as Permission[]);
  return {
    id: r.user.id, name: r.user.name, email: r.user.email, isOwner: r.user.isOwner,
    accountId: r.account.id, businessName: r.account.businessName, permissions,
  };
}
