import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { AccountSettings } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { assertCan, type Actor } from "./access";

const optStr = z.string().trim().optional().transform((s) => (s ? s : undefined));
const bool = z.union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).optional()
  .transform((v) => v === true || v === "on" || v === "true");

export const RETENTION_RULES = [
  { key: "suspendRegular", label: "Suspend overdue regular jobs", help: "Regular jobs this long past their due date are suspended.", num: 3, unit: "month" },
  { key: "suspendOnRequest", label: "Suspend unrequested jobs", help: "On-request jobs not done for this long are suspended.", num: 1, unit: "year" },
  { key: "deleteSuspended", label: "Delete suspended and completed one-off jobs", help: "Suspended jobs, and one-off jobs done this long ago, are deleted.", num: 3, unit: "month" },
  { key: "deleteEstimates", label: "Delete unconverted estimates", help: "Estimates never converted to a job are deleted after this long.", num: 6, unit: "month" },
  { key: "anonymiseDeleted", label: "Anonymise deleted customers", help: "Personal details of customers with no remaining jobs are removed; financial history is kept.", num: 3, unit: "month" },
  { key: "anonymiseInvoices", label: "Anonymise invoices", help: "Notes and job descriptions on invoices this old are removed and their online links stop working.", num: 6, unit: "year" },
] as const;
export type RetentionKey = (typeof RETENTION_RULES)[number]["key"];
export type RetentionRule = { enabled: boolean; num: number; unit: "week" | "month" | "year" };

/** Effective retention rule, falling back to the product defaults (all off). */
export function retentionRule(settings: AccountSettings, key: RetentionKey): RetentionRule {
  const def = RETENTION_RULES.find((r) => r.key === key)!;
  return { enabled: false, num: def.num, unit: def.unit, ...(settings.retention?.[key] ?? {}) };
}

export async function getAccount(accountId: string) {
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!a) throw new Error("Account not found");
  return a;
}

async function mergeSettings(accountId: string, patch: Partial<AccountSettings>, columns: Partial<typeof schema.accounts.$inferInsert> = {}) {
  const a = await getAccount(accountId);
  const settings: AccountSettings = { ...a.settings, ...patch };
  for (const k of Object.keys(settings) as (keyof AccountSettings)[]) if (settings[k] === undefined) delete settings[k];
  await db.update(schema.accounts).set({ ...columns, settings, updatedAt: new Date() }).where(eq(schema.accounts.id, accountId));
}

export const businessInput = z.object({
  businessName: z.string().trim().min(1, "Enter your business name"),
  address: optStr,
  phone: optStr,
  website: optStr,
  email: z.string().trim().email("Enter a valid business email").optional().or(z.literal("")).transform((s) => s || undefined),
  yearEndDay: z.coerce.number().int().min(1).max(31),
  yearEndMonth: z.coerce.number().int().min(1).max(12),
});
export async function updateBusiness(actor: Actor, raw: z.input<typeof businessInput>) {
  assertCan(actor, "edit_settings");
  const b = businessInput.parse(raw);
  await mergeSettings(actor.accountId, { address: b.address, phone: b.phone, website: b.website, email: b.email },
    { businessName: b.businessName, yearEndDay: b.yearEndDay, yearEndMonth: b.yearEndMonth });
}

export const taxInput = z.object({
  collectsVat: bool,
  /** Percentage, e.g. 20 for 20%. */
  vatRatePercent: z.coerce.number().min(0).max(100),
});
export async function updateTaxes(actor: Actor, raw: z.input<typeof taxInput>) {
  assertCan(actor, "edit_settings");
  const t = taxInput.parse(raw);
  await db.update(schema.accounts).set({ collectsVat: t.collectsVat, vatRate: Math.round(t.vatRatePercent * 100) / 10000, updatedAt: new Date() })
    .where(eq(schema.accounts.id, actor.accountId));
}

export const invoicingInput = z.object({
  invoiceTitle: optStr,
  invoiceNotes: optStr,
  invoiceSmallPrint: optStr,
  defaultJobDescription: optStr,
  paymentTermsType: z.enum(["not_required", "by_return", "cod", "net_from_invoice_date", "net_from_month_end"]).default("not_required"),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0),
  showNextDueOnInvoices: bool,
});
export async function updateInvoicing(actor: Actor, raw: z.input<typeof invoicingInput>) {
  assertCan(actor, "edit_settings");
  await mergeSettings(actor.accountId, invoicingInput.parse(raw));
}

export const plannerInput = z.object({
  daysWorked: z.coerce.number().int().min(1, "Choose at least one day worked").max(127),
  firstWeekDay: z.coerce.number().int().min(0).max(6),
  addJobsOrder: z.enum(["next_due", "round_order"]),
  replanFrom: z.enum(["last_job", "last_due"]),
  defaultPaid: z.enum(["job_price", "debt_balance"]),
  autoMarkPolicy: z.enum(["assume_not_done", "mark_done_overnight", "keep_until_next_due"]),
  autoMarkAfterDays: z.coerce.number().int().refine((n) => [1, 2, 3, 4, 5, 7, 14].includes(n), "Choose 1 to 5 days, 1 week or 2 weeks"),
});
export async function updatePlanner(actor: Actor, raw: z.input<typeof plannerInput>) {
  assertCan(actor, "edit_settings");
  await mergeSettings(actor.accountId, plannerInput.parse(raw));
}

export const jobDefaultsInput = z.object({ defaultTimeRequired: z.coerce.number().int().min(0).max(24 * 60) });
export async function updateJobDefaults(actor: Actor, raw: z.input<typeof jobDefaultsInput>) {
  assertCan(actor, "edit_settings");
  await mergeSettings(actor.accountId, jobDefaultsInput.parse(raw));
}

const retentionRuleInput = z.object({
  enabled: bool,
  num: z.coerce.number().int().min(1).max(12),
  unit: z.enum(["week", "month", "year"]),
});
export async function updateRetention(actor: Actor, raw: Partial<Record<RetentionKey, z.input<typeof retentionRuleInput>>>) {
  assertCan(actor, "edit_settings");
  const retention: NonNullable<AccountSettings["retention"]> = {};
  for (const r of RETENTION_RULES) {
    const v = raw[r.key];
    if (v) retention[r.key] = retentionRuleInput.parse(v);
  }
  await mergeSettings(actor.accountId, { retention });
}

/** Change the actor's own password; the current password must be supplied. */
export async function changePassword(actor: Actor, current: string, next: string, confirm: string) {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, actor.id) });
  if (!user) throw new Error("User not found");
  if (!(await verifyPassword(user.passwordHash, current))) throw new Error("Your existing password is not correct");
  if (next.length < 8) throw new Error("New password must be at least 8 characters");
  if (next !== confirm) throw new Error("New passwords do not match");
  await db.update(schema.users).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(schema.users.id, actor.id));
}
