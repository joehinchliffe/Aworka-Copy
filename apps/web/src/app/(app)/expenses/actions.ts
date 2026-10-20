"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toPence } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { ValidationError } from "@/lib/services/customers";
import {
  createCategory, createExpense, createMileage, createRecurring, createSupplier, createVehicle,
  deleteCategory, deleteExpense, deleteMileage, deleteRecurring, deleteSupplier, deleteVehicle,
  updateCategory, updateExpense, updateMileage, updateRecurring, updateSupplier, updateVehicle,
  type ExpenseInput, type MileageInput, type RecurringInput, type VehicleInput,
} from "@/lib/services/expenses";

export type FormState = { errors?: string[]; ok?: string; at?: number } | undefined;

const str = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").trim();
const opt = (f: FormData, k: string) => str(f, k) || null;
/** Pounds typed into a form, as pence; blank means not set. */
function pence(f: FormData, k: string, label: string): number | null {
  const v = str(f, k);
  if (!v) return null;
  try { return toPence(v); } catch { throw new ValidationError([`${label} is not a valid amount`]); }
}
function num(f: FormData, k: string, label: string): number | null {
  const v = str(f, k);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError([`${label} is not a number`]);
  return n;
}
/** A percentage typed into a form, as a fraction (20 -> 0.2). */
const rate = (f: FormData, k: string) => (num(f, k, "VAT rate") ?? 0) / 100;

/** Category and supplier selects offer "new" with a text box beside them. */
function pick(f: FormData, k: "category" | "supplier") {
  const v = str(f, `${k}Id`);
  if (v === "new") return { id: null, name: opt(f, `new_${k}`) };
  return { id: v || null, name: null };
}

function errorsOf(e: unknown): FormState {
  if (e instanceof ValidationError) return { errors: e.errors };
  return { errors: [e instanceof Error ? e.message : "Something went wrong"] };
}

function expenseFrom(f: FormData): ExpenseInput {
  const c = pick(f, "category");
  const s = pick(f, "supplier");
  return {
    date: str(f, "date"),
    categoryId: c.id, newCategoryName: c.name, supplierId: s.id, newSupplierName: s.name,
    reference: opt(f, "reference"), description: opt(f, "description"),
    amount: pence(f, "amount", "Amount"),
    vatStatus: str(f, "vatStatus") as ExpenseInput["vatStatus"],
    vatRate: rate(f, "vatRate"),
    vatCharged: pence(f, "vatCharged", "VAT charged"),
    method: (opt(f, "method") ?? null) as ExpenseInput["method"],
    paymentReference: opt(f, "paymentReference"),
    taxTreatment: (str(f, "taxTreatment") || "all_business") as ExpenseInput["taxTreatment"],
    privateUsePercent: num(f, "privateUsePercent", "Private use"),
    allowableOverride: pence(f, "allowable", "Allowable amount"),
    taxNotes: opt(f, "taxNotes"),
  };
}

const revalidateAll = () => revalidatePath("/expenses", "layout");

export async function createExpenseAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await createExpense(user.accountId, user.id, expenseFrom(f)); } catch (e) { return errorsOf(e); }
  revalidateAll();
  if (f.get("another") === "1") redirect("/expenses/new?saved=1");
  redirect("/expenses");
}

export async function updateExpenseAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await updateExpense(user.accountId, user.id, id, expenseFrom(f)); } catch (e) { return errorsOf(e); }
  revalidateAll();
  redirect("/expenses");
}

export async function deleteExpenseAction(id: string) {
  const user = await requireUser("record_expenses");
  await deleteExpense(user.accountId, user.id, id, todayIso());
  revalidateAll();
  redirect("/expenses");
}

// Categories and suppliers ---------------------------------------------------

export async function saveCategoryAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  const v = { name: str(f, "name"), enabled: f.get("enabled") === "on", capitalAsset: f.get("capitalAsset") === "on" };
  try {
    if (id) await updateCategory(user.accountId, id, v); else await createCategory(user.accountId, v);
  } catch (e) { return errorsOf(e); }
  revalidateAll();
  return { ok: id ? "Saved" : `Added ${v.name}` };
}

export async function deleteCategoryAction(id: string, _: FormState): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await deleteCategory(user.accountId, id); } catch (e) { return errorsOf(e); }
  revalidateAll();
  return { ok: "Deleted" };
}

export async function saveSupplierAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  const v = { name: str(f, "name"), enabled: f.get("enabled") === "on", otherEcState: f.get("otherEcState") === "on" };
  try {
    if (id) await updateSupplier(user.accountId, id, v); else await createSupplier(user.accountId, v);
  } catch (e) { return errorsOf(e); }
  revalidateAll();
  return { ok: id ? "Saved" : `Added ${v.name}` };
}

export async function deleteSupplierAction(id: string, _: FormState): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await deleteSupplier(user.accountId, id); } catch (e) { return errorsOf(e); }
  revalidateAll();
  return { ok: "Deleted" };
}

// Recurring expenses ---------------------------------------------------------

function recurringFrom(f: FormData): RecurringInput {
  const c = pick(f, "category");
  const s = pick(f, "supplier");
  return {
    categoryId: c.id, newCategoryName: c.name, supplierId: s.id, newSupplierName: s.name,
    description: opt(f, "description"),
    amount: pence(f, "amount", "Amount"),
    vatStatus: str(f, "vatStatus") as RecurringInput["vatStatus"],
    vatRate: rate(f, "vatRate"),
    method: (opt(f, "method") ?? null) as RecurringInput["method"],
    everyNum: num(f, "everyNum", "Repeat every") ?? 0,
    everyUnit: str(f, "everyUnit") as RecurringInput["everyUnit"],
    nextDueOn: str(f, "nextDueOn"),
    schedule: str(f, "schedule") as RecurringInput["schedule"],
    endOn: opt(f, "endOn"),
    count: num(f, "count", "Number of payments"),
    totalLimit: pence(f, "totalLimit", "Total"),
  };
}

export async function createRecurringAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await createRecurring(user.accountId, user.id, recurringFrom(f), todayIso()); } catch (e) { return errorsOf(e); }
  revalidateAll();
  redirect("/expenses/recurring");
}

export async function updateRecurringAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try { await updateRecurring(user.accountId, user.id, id, recurringFrom(f), todayIso()); } catch (e) { return errorsOf(e); }
  revalidateAll();
  redirect("/expenses/recurring");
}

export async function deleteRecurringAction(id: string) {
  const user = await requireUser("record_expenses");
  await deleteRecurring(user.accountId, id);
  revalidateAll();
  redirect("/expenses/recurring");
}

// Vehicles and mileage -------------------------------------------------------

function vehicleFrom(f: FormData): VehicleInput {
  return {
    name: str(f, "name"), registration: opt(f, "registration"), acquiredOn: opt(f, "acquiredOn"),
    startMileage: num(f, "startMileage", "Initial mileage") ?? 0,
    ratePerMile: pence(f, "ratePerMile", "Rate per mile") ?? 0,
    notes: opt(f, "notes"),
  };
}

export async function saveVehicleAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try {
    if (id) await updateVehicle(user.accountId, id, vehicleFrom(f)); else await createVehicle(user.accountId, vehicleFrom(f));
  } catch (e) { return errorsOf(e); }
  revalidateAll();
  if (id) redirect("/expenses/mileage");
  return { ok: "Vehicle added", at: Date.now() };
}

export async function deleteVehicleAction(id: string) {
  const user = await requireUser("record_expenses");
  await deleteVehicle(user.accountId, id);
  revalidateAll();
  redirect("/expenses/mileage");
}

function tripFrom(f: FormData): MileageInput {
  return {
    vehicleId: str(f, "vehicleId"), date: str(f, "date"),
    start: num(f, "start", "Start mileage") ?? 0, finish: num(f, "finish", "Finish mileage"),
    notes: opt(f, "notes"),
  };
}

export async function saveTripAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("record_expenses");
  try {
    if (id) await updateMileage(user.accountId, id, tripFrom(f)); else await createMileage(user.accountId, tripFrom(f));
  } catch (e) { return errorsOf(e); }
  revalidateAll();
  if (id) redirect("/expenses/mileage");
  return { ok: "Trip saved", at: Date.now() };
}

export async function deleteTripAction(id: string) {
  const user = await requireUser("record_expenses");
  await deleteMileage(user.accountId, id);
  revalidateAll();
  redirect("/expenses/mileage");
}
