import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Permissions, type Permission } from "@rounds/domain";
import { db, schema } from "@/db";
import type { CurrentUser } from "@/lib/auth";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Create a token; the plain value is returned once and never stored. */
export async function createApiToken(accountId: string, userId: string, label: string) {
  const token = `rnd_${randomBytes(24).toString("base64url")}`;
  const [row] = await db.insert(schema.apiTokens).values({ accountId, userId, label, tokenHash: hash(token), prefix: token.slice(0, 8) }).returning();
  return { token, row: row! };
}

export const listApiTokens = (accountId: string) =>
  db.select().from(schema.apiTokens).where(and(eq(schema.apiTokens.accountId, accountId), isNull(schema.apiTokens.revokedAt))).orderBy(desc(schema.apiTokens.createdAt));

export async function revokeApiToken(accountId: string, id: string) {
  await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.accountId, accountId)));
}

/** Resolve "Authorization: Bearer rnd_..." to the token owner's identity and permissions. */
export async function userForApiToken(header: string | null): Promise<CurrentUser | null> {
  const token = header?.match(/^Bearer\s+(rnd_[A-Za-z0-9_-]+)$/)?.[1];
  if (!token) return null;
  const row = (await db.select({ t: schema.apiTokens, user: schema.users, account: schema.accounts, role: schema.roles })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.apiTokens.accountId))
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.apiTokens.tokenHash, hash(token)), isNull(schema.apiTokens.revokedAt))).limit(1))[0];
  if (!row) return null;
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.t.id));
  return {
    id: row.user.id, name: row.user.name, email: row.user.email, isOwner: row.user.isOwner, accountId: row.account.id,
    businessName: row.account.businessName,
    permissions: row.user.isOwner ? new Set(Permissions) : new Set((row.role?.permissions ?? []) as Permission[]),
  };
}
