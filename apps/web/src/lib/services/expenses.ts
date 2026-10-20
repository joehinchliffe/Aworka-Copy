import { and, asc, desc, eq, gte, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { addDays, addMonths, type IsoDate, type Pence } from "@rounds/domain";
import { db, schema, type Db } from "@/db";
import { logActivity } from "./ledger";
import { ValidationError } from "./customers";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export {
  ExpenseVatStatuses, EXPENSE_VAT_LABELS, ExpenseMethods, EXPENSE_METHOD_LABELS, TaxTreatments, PeriodUnitsE, RecurringSchedules,
  type ExpenseVatStatus, type ExpenseMethod, type TaxTreatment, type ExpensePeriodUnit, type RecurringSchedule,
} from "../expenseOptions";
import {
  ExpenseVatStatuses, ExpenseMethods, TaxTreatments, PeriodUnitsE, RecurringSchedules,
  type ExpenseVatStatus, type ExpenseMethod, type TaxTreatment, type ExpensePeriodUnit,
} from "../expenseOptions";

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

const roundHalfAway = (x: number) => Math.sign(x) * Math.round(Math.abs(x));

/** VAT contained in a gross amount for the given status. */
export function expenseVat(e: { amount: Pence | null; vatStatus: string; vatRate: number; vatCharged?: Pence | null }): Pence | null {
  if (e.amount == null) return null;
  if (e.vatStatus === "inc_at_rate") return roundHalfAway((e.amount * e.vatRate) / (1 + e.vatRate));
  if (e.vatStatus === "inc_charged") return e.vatCharged ?? 0;
  return 0;
}

export interface ExpenseTaxInput {
  amount: Pence | null;
  vatStatus: string;
  vatRate: number;
  vatCharged?: Pence | null;
  /** 0 to 100; null means all business use. */
  privateUsePercent?: number | null;
  /** A custom allowable amount that replaces the computed one. */
  allowableOverride?: Pence | null;
  /** When the business reclaims VAT, the reclaimable part is not also an income tax deduction. */
  reclaimsVat?: boolean;
}

/**
 * Reclaimable VAT and the amount allowable for income tax.
 * - reclaimable VAT = VAT in the amount, reduced by the private-use share;
 * - allowable = amount less the private-use share (less reclaimable VAT when the
 *   business reclaims it), unless a custom amount is given.
 */
export function computeExpenseTax(e: ExpenseTaxInput): { vat: Pence | null; reclaimableVat: Pence | null; allowable: Pence | null } {
  const vat = expenseVat(e);
  const businessShare = 1 - Math.min(100, Math.max(0, e.privateUsePercent ?? 0)) / 100;
  if (e.amount == null) return { vat: null, reclaimableVat: null, allowable: e.allowableOverride ?? null };
  const reclaimableVat = roundHalfAway((vat ?? 0) * businessShare);
  const allowable = e.allowableOverride != null
    ? e.allowableOverride
    : roundHalfAway(e.amount * businessShare) - (e.reclaimsVat ? reclaimableVat : 0);
  return { vat, reclaimableVat, allowable };
}

/** Recover the treatment shown on the form from stored values. */
export function taxTreatmentOf(e: { amount: Pence | null; vatStatus: string; vatRate: number; vatCharged: Pence | null; privateUsePercent: number | null; allowable: Pence | null }, reclaimsVat = false): TaxTreatment {
  if (e.amount != null && e.allowable != null) {
    const computed = computeExpenseTax({ ...e, reclaimsVat }).allowable;
    if (computed !== e.allowable) return "custom";
  }
  if (e.amount == null && e.allowable != null) return "custom";
  return e.privateUsePercent ? "private_use" : "all_business";
}

export interface ExpenseValidationInput {
  date?: string | null;
  categoryId?: string | null;
  newCategoryName?: string | null;
  amount: Pence | null;
  vatStatus: string;
  vatRate: number;
  vatCharged?: Pence | null;
  privateUsePercent?: number | null;
  taxTreatment?: TaxTreatment;
  allowableOverride?: Pence | null;
}

export function validateExpense(e: ExpenseValidationInput): string[] {
  const errors: string[] = [];
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push("Enter the date");
  if (!e.categoryId && !e.newCategoryName?.trim()) errors.push("Choose or enter a category");
  if (!(ExpenseVatStatuses as readonly string[]).includes(e.vatStatus)) errors.push("Choose a VAT status");
  if (e.vatStatus === "inc_at_rate" && !(e.vatRate > 0)) errors.push("The VAT rate must be more than 0%");
  if (e.vatStatus === "inc_at_rate" && e.vatRate >= 1) errors.push("The VAT rate must be less than 100%");
  if (e.vatStatus === "inc_charged") {
    if (!(e.vatCharged != null && e.vatCharged > 0)) errors.push("The VAT charged must be more than 0");
    else if (e.amount != null && e.vatCharged * 2 > e.amount) errors.push("The VAT charged cannot be more than half the amount");
  }
  if (e.privateUsePercent != null && (e.privateUsePercent < 0 || e.privateUsePercent > 100)) errors.push("Private use must be between 0% and 100%");
  if (e.taxTreatment === "private_use" && !(e.privateUsePercent != null && e.privateUsePercent > 0)) errors.push("Enter the private use percentage");
  if (e.taxTreatment === "custom" && e.allowableOverride == null) errors.push("Enter the amount allowable for income tax");
  return errors;
}

/** Turn "N units starting/ending on a date" into an inclusive date range. */
export function periodRange(p: { num: number; unit: ExpensePeriodUnit; anchor: "starting" | "ending"; date: IsoDate }): { from: IsoDate; to: IsoDate } {
  const n = Math.max(1, Math.floor(p.num));
  const shift = (d: IsoDate, k: number) => advance(d, k, p.unit);
  if (p.anchor === "starting") return { from: p.date, to: addDays(shift(p.date, n), -1) };
  return { from: addDays(shift(p.date, -n), 1), to: p.date };
}

/** Move a date by k units. */
export function advance(d: IsoDate, k: number, unit: string): IsoDate {
  if (unit === "day") return addDays(d, k);
  if (unit === "week") return addDays(d, 7 * k);
  if (unit === "month") return addMonths(d, k);
  if (unit === "year") return addMonths(d, 12 * k);
  throw new Error(`Unknown period unit: ${unit}`);
}

/** Miles driven and their value at the vehicle's rate per mile. Pending until a finish reading exists. */
export function mileageValue(m: { start: number; finish: number | null }, ratePerMile: Pence): { miles: number | null; value: Pence | null; pending: boolean } {
  if (m.finish == null) return { miles: null, value: null, pending: true };
  const miles = m.finish - m.start;
  return { miles, value: miles * ratePerMile, pending: false };
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const optStr = z.string().trim().optional().nullable().transform((s) => (s ? s : null));
const optId = z.string().uuid().optional().nullable().or(z.literal("")).transform((s) => (s ? s : null));
const optPence = z.number().int().optional().nullable().transform((n) => (n == null ? null : n));

export const expenseInput = z.object({
  date: isoDate,
  categoryId: optId,
  newCategoryName: optStr,
  supplierId: optId,
  newSupplierName: optStr,
  reference: optStr,
  description: optStr,
  amount: optPence,
  vatStatus: z.enum(ExpenseVatStatuses).default("inc_at_rate"),
  vatRate: z.number().min(0).max(1).default(0.2),
  vatCharged: optPence,
  method: z.enum(ExpenseMethods).optional().nullable().or(z.literal("")).transform((s) => (s ? s : null)),
  paymentReference: optStr,
  taxTreatment: z.enum(TaxTreatments).default("all_business"),
  privateUsePercent: z.number().optional().nullable().transform((n) => (n == null ? null : n)),
  allowableOverride: optPence,
  taxNotes: optStr,
});
export type ExpenseInput = z.input<typeof expenseInput>;

export const recurringInput = z.object({
  categoryId: optId,
  newCategoryName: optStr,
  supplierId: optId,
  newSupplierName: optStr,
  description: optStr,
  amount: optPence,
  vatStatus: z.enum(["inc_at_rate", "zero_rate", "exempt", "out_of_scope"]).default("inc_at_rate"),
  vatRate: z.number().min(0).max(1).default(0.2),
  method: z.enum(ExpenseMethods).optional().nullable().or(z.literal("")).transform((s) => (s ? s : null)),
  everyNum: z.number().int().min(1, "Repeat every must be at least 1").max(366),
  everyUnit: z.enum(PeriodUnitsE).default("month"),
  nextDueOn: isoDate,
  schedule: z.enum(RecurringSchedules).default("forever"),
  endOn: z.string().optional().nullable().transform((s) => (s ? s : null)),
  count: z.number().int().optional().nullable(),
  totalLimit: optPence,
});
export type RecurringInput = z.input<typeof recurringInput>;

export const vehicleInput = z.object({
  name: z.string().trim().min(1, "Enter a name for the vehicle"),
  registration: optStr,
  acquiredOn: z.string().optional().nullable().transform((s) => (s ? s : null)),
  startMileage: z.number().int().min(0).default(0),
  ratePerMile: z.number().int().min(0).default(45),
  notes: optStr,
});
export type VehicleInput = z.input<typeof vehicleInput>;

export const mileageInput = z.object({
  vehicleId: z.string().uuid("Choose a vehicle"),
  date: isoDate,
  start: z.number().int().min(0, "Start mileage cannot be negative"),
  finish: z.number().int().optional().nullable().transform((n) => (n == null ? null : n)),
  notes: optStr,
});
export type MileageInput = z.input<typeof mileageInput>;

// ---------------------------------------------------------------------------
// Categories and suppliers
// ---------------------------------------------------------------------------

export async function listCategories(accountId: string, opts: { enabledOnly?: boolean } = {}) {
  const conds = [eq(schema.expenseCategories.accountId, accountId)];
  if (opts.enabledOnly) conds.push(eq(schema.expenseCategories.enabled, true));
  return db.select().from(schema.expenseCategories).where(and(...conds)).orderBy(asc(schema.expenseCategories.name));
}

export async function listSuppliers(accountId: string, opts: { enabledOnly?: boolean } = {}) {
  const conds = [eq(schema.expenseSuppliers.accountId, accountId)];
  if (opts.enabledOnly) conds.push(eq(schema.expenseSuppliers.enabled, true));
  const rows = await db.select().from(schema.expenseSuppliers).where(and(...conds)).orderBy(asc(schema.expenseSuppliers.name));
  const ec = new Set(await ecSupplierIds(accountId));
  return rows.map((r) => ({ ...r, otherEcState: ec.has(r.id) }));
}

/** Find a category by name (case-insensitive) or create it. */
async function categoryByName(tx: Tx, accountId: string, name: string) {
  const found = await tx.select().from(schema.expenseCategories)
    .where(and(eq(schema.expenseCategories.accountId, accountId), sql`lower(${schema.expenseCategories.name}) = lower(${name})`)).limit(1);
  if (found[0]) return found[0];
  const [c] = await tx.insert(schema.expenseCategories).values({ accountId, name }).returning();
  return c!;
}

async function supplierByName(tx: Tx, accountId: string, name: string) {
  const found = await tx.select().from(schema.expenseSuppliers)
    .where(and(eq(schema.expenseSuppliers.accountId, accountId), sql`lower(${schema.expenseSuppliers.name}) = lower(${name})`)).limit(1);
  if (found[0]) return found[0];
  const [s] = await tx.insert(schema.expenseSuppliers).values({ accountId, name }).returning();
  return s!;
}

async function ownCategory(tx: Tx, accountId: string, id: string) {
  const c = await tx.query.expenseCategories.findFirst({ where: and(eq(schema.expenseCategories.id, id), eq(schema.expenseCategories.accountId, accountId)) });
  if (!c) throw new ValidationError(["Category not found"]);
  return c;
}

async function ownSupplier(tx: Tx, accountId: string, id: string) {
  const s = await tx.query.expenseSuppliers.findFirst({ where: and(eq(schema.expenseSuppliers.id, id), eq(schema.expenseSuppliers.accountId, accountId)) });
  if (!s) throw new ValidationError(["Supplier not found"]);
  return s;
}

/** Resolve the category and supplier ids from either a chosen id or a new name. */
async function resolveCategorySupplier(tx: Tx, accountId: string, i: { categoryId: string | null; newCategoryName: string | null; supplierId: string | null; newSupplierName: string | null }) {
  const categoryId = i.newCategoryName ? (await categoryByName(tx, accountId, i.newCategoryName)).id : (await ownCategory(tx, accountId, i.categoryId!)).id;
  const supplierId = i.newSupplierName ? (await supplierByName(tx, accountId, i.newSupplierName)).id
    : i.supplierId ? (await ownSupplier(tx, accountId, i.supplierId)).id : null;
  return { categoryId, supplierId };
}

export async function createCategory(accountId: string, c: { name: string; enabled?: boolean; capitalAsset?: boolean }) {
  const name = c.name.trim();
  if (!name) throw new ValidationError(["Enter a name"]);
  await assertUniqueName("category", accountId, name);
  const [row] = await db.insert(schema.expenseCategories).values({ accountId, name, enabled: c.enabled ?? true, capitalAsset: c.capitalAsset ?? false }).returning();
  return row!;
}

export async function updateCategory(accountId: string, id: string, c: { name: string; enabled: boolean; capitalAsset: boolean }) {
  const name = c.name.trim();
  if (!name) throw new ValidationError(["Enter a name"]);
  await assertUniqueName("category", accountId, name, id);
  await db.update(schema.expenseCategories).set({ name, enabled: c.enabled, capitalAsset: c.capitalAsset, updatedAt: new Date() })
    .where(and(eq(schema.expenseCategories.id, id), eq(schema.expenseCategories.accountId, accountId)));
}

/** Categories in use cannot be deleted; disable them instead. */
export async function deleteCategory(accountId: string, id: string) {
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.expenses)
    .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.categoryId, id)));
  const [usedR] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.recurringExpenses)
    .where(and(eq(schema.recurringExpenses.accountId, accountId), eq(schema.recurringExpenses.categoryId, id)));
  if ((used?.n ?? 0) + (usedR?.n ?? 0) > 0) throw new ValidationError(["This category is used by expenses; disable it instead"]);
  await db.delete(schema.expenseCategories).where(and(eq(schema.expenseCategories.id, id), eq(schema.expenseCategories.accountId, accountId)));
}

export async function createSupplier(accountId: string, s: { name: string; enabled?: boolean; otherEcState?: boolean }) {
  const name = s.name.trim();
  if (!name) throw new ValidationError(["Enter a name"]);
  await assertUniqueName("supplier", accountId, name);
  const [row] = await db.insert(schema.expenseSuppliers).values({ accountId, name, enabled: s.enabled ?? true }).returning();
  await setEcSupplier(accountId, row!.id, s.otherEcState ?? false);
  return row!;
}

export async function updateSupplier(accountId: string, id: string, s: { name: string; enabled: boolean; otherEcState?: boolean }) {
  const name = s.name.trim();
  if (!name) throw new ValidationError(["Enter a name"]);
  await assertUniqueName("supplier", accountId, name, id);
  await db.update(schema.expenseSuppliers).set({ name, enabled: s.enabled, updatedAt: new Date() })
    .where(and(eq(schema.expenseSuppliers.id, id), eq(schema.expenseSuppliers.accountId, accountId)));
  if (s.otherEcState !== undefined) await setEcSupplier(accountId, id, s.otherEcState);
}

export async function deleteSupplier(accountId: string, id: string) {
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.expenses)
    .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.supplierId, id)));
  const [usedR] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.recurringExpenses)
    .where(and(eq(schema.recurringExpenses.accountId, accountId), eq(schema.recurringExpenses.supplierId, id)));
  if ((used?.n ?? 0) + (usedR?.n ?? 0) > 0) throw new ValidationError(["This supplier is used by expenses; disable it instead"]);
  await db.delete(schema.expenseSuppliers).where(and(eq(schema.expenseSuppliers.id, id), eq(schema.expenseSuppliers.accountId, accountId)));
  await setEcSupplier(accountId, id, false);
}

async function assertUniqueName(kind: "category" | "supplier", accountId: string, name: string, exceptId?: string) {
  const t = kind === "category" ? schema.expenseCategories : schema.expenseSuppliers;
  const conds: SQL[] = [eq(t.accountId, accountId), sql`lower(${t.name}) = lower(${name})`];
  if (exceptId) conds.push(ne(t.id, exceptId));
  const found = await db.select({ id: t.id }).from(t).where(and(...conds)).limit(1);
  if (found.length) throw new ValidationError([`A ${kind} called "${name}" already exists`]);
}

/** Suppliers based in another EC state are kept in the account settings (no column for it). */
type ExpenseSettings = { expenseEcSupplierIds?: string[] };

async function ecSupplierIds(accountId: string): Promise<string[]> {
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), columns: { settings: true } });
  return ((a?.settings ?? {}) as ExpenseSettings).expenseEcSupplierIds ?? [];
}

async function setEcSupplier(accountId: string, supplierId: string, on: boolean) {
  const a = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), columns: { settings: true } });
  if (!a) return;
  const settings = a.settings as typeof a.settings & ExpenseSettings;
  const ids = new Set(settings.expenseEcSupplierIds ?? []);
  if (on === ids.has(supplierId)) return;
  if (on) ids.add(supplierId); else ids.delete(supplierId);
  const next = { ...settings, expenseEcSupplierIds: [...ids] };
  await db.update(schema.accounts).set({ settings: next, updatedAt: new Date() }).where(eq(schema.accounts.id, accountId));
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

async function reclaimsVat(tx: Tx, accountId: string) {
  const a = await tx.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), columns: { collectsVat: true } });
  return a?.collectsVat ?? false;
}

function parseExpense(raw: ExpenseInput) {
  const r = expenseInput.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message));
  const e = r.data;
  const errors = validateExpense(e);
  if (errors.length) throw new ValidationError(errors);
  return e;
}

function storedTaxFields(e: z.output<typeof expenseInput>, reclaims: boolean) {
  const privateUsePercent = e.taxTreatment === "all_business" ? null : e.privateUsePercent && e.privateUsePercent > 0 ? e.privateUsePercent : null;
  const vatCharged = e.vatStatus === "inc_charged" ? e.vatCharged : null;
  const t = computeExpenseTax({
    amount: e.amount, vatStatus: e.vatStatus, vatRate: e.vatRate, vatCharged, privateUsePercent,
    allowableOverride: e.taxTreatment === "custom" ? e.allowableOverride : null, reclaimsVat: reclaims,
  });
  return { privateUsePercent, vatCharged, reclaimableVat: t.reclaimableVat, allowable: t.allowable };
}

export async function createExpense(accountId: string, userId: string | null, raw: ExpenseInput) {
  const e = parseExpense(raw);
  return db.transaction(async (tx) => {
    const { categoryId, supplierId } = await resolveCategorySupplier(tx, accountId, e);
    const tax = storedTaxFields(e, await reclaimsVat(tx, accountId));
    const [row] = await tx.insert(schema.expenses).values({
      accountId, date: e.date, categoryId, supplierId, reference: e.reference, description: e.description,
      amount: e.amount, vatStatus: e.vatStatus, vatRate: e.vatRate, method: e.method, paymentReference: e.paymentReference,
      taxNotes: e.taxNotes, ...tax,
    }).returning();
    await logActivity(tx, { accountId, userId, date: e.date, category: "expenses", subcategory: "created", summary: `Expense${e.description ? `: ${e.description}` : ""}`, amount: e.amount });
    return row!;
  });
}

export async function updateExpense(accountId: string, userId: string | null, id: string, raw: ExpenseInput) {
  const e = parseExpense(raw);
  return db.transaction(async (tx) => {
    const existing = await tx.query.expenses.findFirst({ where: and(eq(schema.expenses.id, id), eq(schema.expenses.accountId, accountId)) });
    if (!existing) throw new ValidationError(["Expense not found"]);
    const { categoryId, supplierId } = await resolveCategorySupplier(tx, accountId, e);
    const tax = storedTaxFields(e, await reclaimsVat(tx, accountId));
    const [row] = await tx.update(schema.expenses).set({
      date: e.date, categoryId, supplierId, reference: e.reference, description: e.description,
      amount: e.amount, vatStatus: e.vatStatus, vatRate: e.vatRate, method: e.method, paymentReference: e.paymentReference,
      taxNotes: e.taxNotes, ...tax, updatedAt: new Date(),
    }).where(eq(schema.expenses.id, id)).returning();
    await logActivity(tx, { accountId, userId, date: e.date, category: "expenses", subcategory: "updated", summary: `Expense changed${e.description ? `: ${e.description}` : ""}`, amount: e.amount });
    return row!;
  });
}

export async function deleteExpense(accountId: string, userId: string | null, id: string, today: IsoDate) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.accountId, accountId))).returning();
    if (!row) throw new ValidationError(["Expense not found"]);
    await logActivity(tx, { accountId, userId, date: today, category: "expenses", subcategory: "deleted", summary: `Expense deleted${row.description ? `: ${row.description}` : ""}`, amount: row.amount });
  });
}

export async function getExpense(accountId: string, id: string) {
  const e = await db.query.expenses.findFirst({ where: and(eq(schema.expenses.id, id), eq(schema.expenses.accountId, accountId)) });
  if (!e) return null;
  const reclaims = await reclaimsVat(db, accountId);
  return { expense: e, taxTreatment: taxTreatmentOf(e, reclaims) };
}

export interface ExpenseFilter {
  categoryId?: string;
  supplierId?: string;
  method?: string;
  from?: IsoDate;
  to?: IsoDate;
  amountNotSet?: boolean;
}

export async function listExpenses(accountId: string, f: ExpenseFilter = {}) {
  const t = schema.expenses;
  const conds: SQL[] = [eq(t.accountId, accountId)];
  if (f.categoryId) conds.push(eq(t.categoryId, f.categoryId));
  if (f.supplierId) conds.push(eq(t.supplierId, f.supplierId));
  if (f.method) conds.push(eq(t.method, f.method));
  if (f.from) conds.push(gte(t.date, f.from));
  if (f.to) conds.push(lte(t.date, f.to));
  if (f.amountNotSet) conds.push(isNull(t.amount));
  const rows = await db.select({ expense: t, category: schema.expenseCategories.name, supplier: schema.expenseSuppliers.name })
    .from(t)
    .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, t.categoryId))
    .leftJoin(schema.expenseSuppliers, eq(schema.expenseSuppliers.id, t.supplierId))
    .where(and(...conds)).orderBy(desc(t.date), desc(t.createdAt)).limit(2000);
  const totals = rows.reduce((s, r) => ({
    amount: s.amount + (r.expense.amount ?? 0),
    reclaimableVat: s.reclaimableVat + (r.expense.reclaimableVat ?? 0),
    allowable: s.allowable + (r.expense.allowable ?? 0),
    amountNotSet: s.amountNotSet + (r.expense.amount == null ? 1 : 0),
  }), { amount: 0, reclaimableVat: 0, allowable: 0, amountNotSet: 0 });
  return { rows, totals };
}

/** The values of the most recent expense in a category, ready to prefill a new one. */
export async function lastExpenseInCategory(accountId: string, categoryId: string) {
  const [row] = await db.select().from(schema.expenses)
    .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.categoryId, categoryId)))
    .orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt)).limit(1);
  return row ?? null;
}

/** Copy the most recent expense in a category to a new date. Returns null when the category has none. */
export async function duplicateLastExpense(accountId: string, userId: string | null, categoryId: string, date: IsoDate) {
  const last = await lastExpenseInCategory(accountId, categoryId);
  if (!last) return null;
  const reclaims = await reclaimsVat(db, accountId);
  const treatment = taxTreatmentOf(last, reclaims);
  return createExpense(accountId, userId, {
    date, categoryId: last.categoryId, supplierId: last.supplierId, reference: last.reference, description: last.description,
    amount: last.amount, vatStatus: last.vatStatus as ExpenseVatStatus, vatRate: last.vatRate, vatCharged: last.vatCharged,
    method: last.method as ExpenseMethod | null, paymentReference: last.paymentReference, taxTreatment: treatment,
    privateUsePercent: last.privateUsePercent, allowableOverride: treatment === "custom" ? last.allowable : null, taxNotes: last.taxNotes,
  });
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

type Recurring = typeof schema.recurringExpenses.$inferSelect;

function parseRecurring(raw: RecurringInput) {
  const r = recurringInput.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message));
  const e = r.data;
  const errors: string[] = [];
  if (!e.categoryId && !e.newCategoryName) errors.push("Choose or enter a category");
  if (e.vatStatus === "inc_at_rate" && !(e.vatRate > 0)) errors.push("The VAT rate must be more than 0%");
  if (e.schedule === "count" && !(e.count != null && e.count >= 1)) errors.push("Enter how many payments to make");
  if (e.schedule === "until_date") {
    if (!e.endOn || !/^\d{4}-\d{2}-\d{2}$/.test(e.endOn)) errors.push("Enter the date to stop on");
    else if (e.endOn < e.nextDueOn) errors.push("The end date is before the next due date");
  }
  if (e.schedule === "until_total") {
    if (!(e.totalLimit != null && e.totalLimit > 0)) errors.push("Enter the total to stop at");
    if (!(e.amount != null && e.amount > 0)) errors.push("An amount is needed to stop at a total");
  }
  if (errors.length) throw new ValidationError(errors);
  return e;
}

/** Whether a recurring expense still has instances to generate at its next due date. */
export function recurringActive(r: Pick<Recurring, "schedule" | "nextDueOn" | "endOn" | "remainingCount" | "totalLimit" | "totalSoFar">): boolean {
  if (r.schedule === "count") return (r.remainingCount ?? 0) > 0;
  if (r.schedule === "until_date") return !!r.endOn && r.nextDueOn <= r.endOn;
  if (r.schedule === "until_total") return (r.totalLimit ?? 0) > r.totalSoFar;
  return true;
}

export async function listRecurring(accountId: string) {
  const rows = await db.select({ recurring: schema.recurringExpenses, category: schema.expenseCategories.name, supplier: schema.expenseSuppliers.name })
    .from(schema.recurringExpenses)
    .innerJoin(schema.expenseCategories, eq(schema.expenseCategories.id, schema.recurringExpenses.categoryId))
    .leftJoin(schema.expenseSuppliers, eq(schema.expenseSuppliers.id, schema.recurringExpenses.supplierId))
    .where(eq(schema.recurringExpenses.accountId, accountId)).orderBy(asc(schema.recurringExpenses.nextDueOn));
  return rows.map((r) => ({ ...r, active: recurringActive(r.recurring) }));
}

export async function getRecurring(accountId: string, id: string) {
  const r = await db.query.recurringExpenses.findFirst({ where: and(eq(schema.recurringExpenses.id, id), eq(schema.recurringExpenses.accountId, accountId)) });
  if (!r) return null;
  const generated = await db.select().from(schema.expenses)
    .where(and(eq(schema.expenses.accountId, accountId), eq(schema.expenses.recurringExpenseId, id))).orderBy(desc(schema.expenses.date));
  return { recurring: r, generated };
}

/**
 * Create a recurring expense, then catch up any instances already due.
 * For "count" the counter is the number of payments still to make; for
 * "until_total" the running total starts at zero.
 */
export async function createRecurring(accountId: string, userId: string | null, raw: RecurringInput, today: IsoDate) {
  const e = parseRecurring(raw);
  const row = await db.transaction(async (tx) => {
    const { categoryId, supplierId } = await resolveCategorySupplier(tx, accountId, e);
    const [r] = await tx.insert(schema.recurringExpenses).values({
      accountId, categoryId, supplierId, description: e.description, amount: e.amount, vatStatus: e.vatStatus, vatRate: e.vatRate,
      method: e.method, everyNum: e.everyNum, everyUnit: e.everyUnit, nextDueOn: e.nextDueOn, schedule: e.schedule,
      endOn: e.schedule === "until_date" ? e.endOn : null,
      remainingCount: e.schedule === "count" ? e.count! : null,
      totalLimit: e.schedule === "until_total" ? e.totalLimit : null,
      totalSoFar: 0,
    }).returning();
    return r!;
  });
  const generated = await generateDueRecurringExpenses(accountId, today, { userId, recurringId: row.id });
  return { recurring: row, generated };
}

/**
 * Edit the template. Generated expenses are never altered. For "count", the
 * entered number is the payments still to make from the next due date.
 */
export async function updateRecurring(accountId: string, userId: string | null, id: string, raw: RecurringInput, today: IsoDate) {
  const e = parseRecurring(raw);
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.recurringExpenses)
      .where(and(eq(schema.recurringExpenses.id, id), eq(schema.recurringExpenses.accountId, accountId))).for("update");
    if (!existing) throw new ValidationError(["Recurring expense not found"]);
    const { categoryId, supplierId } = await resolveCategorySupplier(tx, accountId, e);
    await tx.update(schema.recurringExpenses).set({
      categoryId, supplierId, description: e.description, amount: e.amount, vatStatus: e.vatStatus, vatRate: e.vatRate,
      method: e.method, everyNum: e.everyNum, everyUnit: e.everyUnit, nextDueOn: e.nextDueOn, schedule: e.schedule,
      endOn: e.schedule === "until_date" ? e.endOn : null,
      remainingCount: e.schedule === "count" ? e.count! : null,
      totalLimit: e.schedule === "until_total" ? e.totalLimit : null,
      updatedAt: new Date(),
    }).where(eq(schema.recurringExpenses.id, id));
  });
  return generateDueRecurringExpenses(accountId, today, { userId, recurringId: id });
}

/** Delete the template; expenses it generated are kept (their link is cleared). */
export async function deleteRecurring(accountId: string, id: string) {
  await db.delete(schema.recurringExpenses).where(and(eq(schema.recurringExpenses.id, id), eq(schema.recurringExpenses.accountId, accountId)));
}

/**
 * Create every instance that has fallen due on or before `today`, link each to
 * its parent and advance the next due date. Each template is locked while it is
 * processed and an existing instance on the same date is never recreated, so
 * running this repeatedly or concurrently never duplicates. Returns the number
 * of expenses created.
 */
export async function generateDueRecurringExpenses(accountId: string, today: IsoDate, opts: { userId?: string | null; recurringId?: string } = {}): Promise<number> {
  const conds: SQL[] = [eq(schema.recurringExpenses.accountId, accountId), lte(schema.recurringExpenses.nextDueOn, today)];
  if (opts.recurringId) conds.push(eq(schema.recurringExpenses.id, opts.recurringId));
  const due = await db.select({ id: schema.recurringExpenses.id }).from(schema.recurringExpenses).where(and(...conds));
  let created = 0;
  for (const { id } of due) {
    created += await db.transaction(async (tx) => {
      const [r] = await tx.select().from(schema.recurringExpenses).where(eq(schema.recurringExpenses.id, id)).for("update");
      if (!r) return 0;
      const reclaims = await reclaimsVat(tx, accountId);
      let n = 0;
      const state = { nextDueOn: r.nextDueOn, remainingCount: r.remainingCount, totalSoFar: r.totalSoFar };
      // Guard against runaway loops from very old next due dates.
      for (let guard = 0; guard < 5000 && state.nextDueOn <= today && recurringActive({ ...r, ...state }); guard++) {
        let amount = r.amount;
        if (r.schedule === "until_total" && amount != null) amount = Math.min(amount, (r.totalLimit ?? 0) - state.totalSoFar);
        const exists = await tx.select({ id: schema.expenses.id }).from(schema.expenses)
          .where(and(eq(schema.expenses.recurringExpenseId, r.id), eq(schema.expenses.date, state.nextDueOn))).limit(1);
        if (!exists.length) {
          const tax = computeExpenseTax({ amount, vatStatus: r.vatStatus, vatRate: r.vatRate, reclaimsVat: reclaims });
          await tx.insert(schema.expenses).values({
            accountId, date: state.nextDueOn, categoryId: r.categoryId, supplierId: r.supplierId, recurringExpenseId: r.id,
            description: r.description, amount, vatStatus: r.vatStatus, vatRate: r.vatRate, method: r.method,
            reclaimableVat: tax.reclaimableVat, allowable: tax.allowable,
          });
          await logActivity(tx, { accountId, userId: opts.userId ?? null, date: state.nextDueOn, category: "expenses", subcategory: "recurring", summary: `Recurring expense${r.description ? `: ${r.description}` : ""}`, amount });
          n++;
        }
        if (r.schedule === "count") state.remainingCount = (state.remainingCount ?? 0) - 1;
        if (r.schedule === "until_total") state.totalSoFar += amount ?? 0;
        state.nextDueOn = advance(state.nextDueOn, r.everyNum, r.everyUnit);
      }
      if (state.nextDueOn !== r.nextDueOn) {
        await tx.update(schema.recurringExpenses).set({ ...state, updatedAt: new Date() }).where(eq(schema.recurringExpenses.id, r.id));
      }
      return n;
    });
  }
  return created;
}

/** Nightly entry point: generate due recurring expenses for every account. */
export async function generateAllDueRecurringExpenses(today: IsoDate): Promise<number> {
  const accounts = await db.selectDistinct({ accountId: schema.recurringExpenses.accountId }).from(schema.recurringExpenses)
    .where(lte(schema.recurringExpenses.nextDueOn, today));
  let n = 0;
  for (const a of accounts) n += await generateDueRecurringExpenses(a.accountId, today);
  return n;
}

// ---------------------------------------------------------------------------
// Vehicles and mileage
// ---------------------------------------------------------------------------

function parseWith<T extends z.ZodTypeAny>(s: T, raw: unknown): z.output<T> {
  const r = s.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message));
  return r.data;
}

export async function listVehicles(accountId: string) {
  return db.select().from(schema.vehicles).where(eq(schema.vehicles.accountId, accountId)).orderBy(asc(schema.vehicles.name));
}

export async function createVehicle(accountId: string, raw: VehicleInput) {
  const v = parseWith(vehicleInput, raw);
  const [row] = await db.insert(schema.vehicles).values({ accountId, ...v }).returning();
  return row!;
}

export async function updateVehicle(accountId: string, id: string, raw: VehicleInput) {
  const v = parseWith(vehicleInput, raw);
  const [row] = await db.update(schema.vehicles).set({ ...v, updatedAt: new Date() })
    .where(and(eq(schema.vehicles.id, id), eq(schema.vehicles.accountId, accountId))).returning();
  if (!row) throw new ValidationError(["Vehicle not found"]);
  return row;
}

export async function getVehicle(accountId: string, id: string) {
  return (await db.query.vehicles.findFirst({ where: and(eq(schema.vehicles.id, id), eq(schema.vehicles.accountId, accountId)) })) ?? null;
}

export async function getMileage(accountId: string, id: string) {
  return (await db.query.mileages.findFirst({ where: and(eq(schema.mileages.id, id), eq(schema.mileages.accountId, accountId)) })) ?? null;
}

export async function deleteVehicle(accountId: string, id: string) {
  await db.delete(schema.vehicles).where(and(eq(schema.vehicles.id, id), eq(schema.vehicles.accountId, accountId)));
}

async function ownVehicle(accountId: string, id: string) {
  const v = await db.query.vehicles.findFirst({ where: and(eq(schema.vehicles.id, id), eq(schema.vehicles.accountId, accountId)) });
  if (!v) throw new ValidationError(["Vehicle not found"]);
  return v;
}

function validateTrip(m: z.output<typeof mileageInput>) {
  if (m.finish != null && m.finish < m.start) throw new ValidationError(["The finish mileage cannot be less than the start"]);
}

export async function createMileage(accountId: string, raw: MileageInput) {
  const m = parseWith(mileageInput, raw);
  validateTrip(m);
  await ownVehicle(accountId, m.vehicleId);
  const [row] = await db.insert(schema.mileages).values({ accountId, ...m }).returning();
  return row!;
}

export async function updateMileage(accountId: string, id: string, raw: MileageInput) {
  const m = parseWith(mileageInput, raw);
  validateTrip(m);
  await ownVehicle(accountId, m.vehicleId);
  const [row] = await db.update(schema.mileages).set({ ...m, updatedAt: new Date() })
    .where(and(eq(schema.mileages.id, id), eq(schema.mileages.accountId, accountId))).returning();
  if (!row) throw new ValidationError(["Trip not found"]);
  return row;
}

export async function deleteMileage(accountId: string, id: string) {
  await db.delete(schema.mileages).where(and(eq(schema.mileages.id, id), eq(schema.mileages.accountId, accountId)));
}

/** Suggested start reading for a new trip: the vehicle's latest finish, else its initial mileage. */
export async function suggestedStart(accountId: string, vehicleId: string): Promise<number> {
  const v = await ownVehicle(accountId, vehicleId);
  const [row] = await db.select({ max: sql<number | null>`max(coalesce(${schema.mileages.finish}, ${schema.mileages.start}))::int` })
    .from(schema.mileages).where(and(eq(schema.mileages.accountId, accountId), eq(schema.mileages.vehicleId, vehicleId)));
  return row?.max ?? v.startMileage;
}

export async function listMileages(accountId: string, f: { vehicleId?: string; from?: IsoDate; to?: IsoDate } = {}) {
  const t = schema.mileages;
  const conds: SQL[] = [eq(t.accountId, accountId)];
  if (f.vehicleId) conds.push(eq(t.vehicleId, f.vehicleId));
  if (f.from) conds.push(gte(t.date, f.from));
  if (f.to) conds.push(lte(t.date, f.to));
  const rows = await db.select({ trip: t, vehicle: schema.vehicles }).from(t)
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, t.vehicleId))
    .where(and(...conds)).orderBy(desc(t.date), desc(t.start)).limit(2000);
  const trips = rows.map((r) => ({ ...r, ...mileageValue(r.trip, r.vehicle.ratePerMile) }));
  const totals = trips.reduce((s, r) => ({ miles: s.miles + (r.miles ?? 0), value: s.value + (r.value ?? 0), pending: s.pending + (r.pending ? 1 : 0) }), { miles: 0, value: 0, pending: 0 });
  return { trips, totals };
}
