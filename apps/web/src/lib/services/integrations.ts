import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, encrypt } from "@/lib/crypto";

export type Provider = "stripe" | "gocardless";
export type Integration = typeof schema.integrations.$inferSelect;

/** The account's live connection to a provider, or null when not connected. */
export async function getIntegration(accountId: string, provider: Provider): Promise<Integration | null> {
  const row = await db.query.integrations.findFirst({
    where: and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, provider)),
  });
  return row && row.status === "connected" && row.secret ? row : null;
}

export function integrationSecret<T>(row: Integration): T {
  if (!row.secret) throw new Error("Integration has no stored credentials");
  return decrypt<T>(row.secret);
}

/** Create or replace the account's connection, encrypting the credentials. */
export async function saveIntegration(accountId: string, provider: Provider, v: { secret: unknown; externalId?: string | null; config?: Record<string, unknown> }) {
  const values = {
    status: "connected", secret: encrypt(v.secret), externalId: v.externalId ?? null, config: v.config ?? {}, updatedAt: new Date(),
  };
  await db.insert(schema.integrations).values({ accountId, provider, ...values })
    .onConflictDoUpdate({ target: [schema.integrations.accountId, schema.integrations.provider], set: values });
}

/** Forget credentials but keep the row (and its external id) for the record. */
export async function disconnectIntegration(accountId: string, provider: Provider, status = "disconnected") {
  await db.update(schema.integrations).set({ status, secret: null, updatedAt: new Date() })
    .where(and(eq(schema.integrations.accountId, accountId), eq(schema.integrations.provider, provider)));
}

/** Public base URL used in links and provider redirects. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
