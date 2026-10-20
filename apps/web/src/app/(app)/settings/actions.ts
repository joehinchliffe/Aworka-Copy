"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maskFromDays } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { errorsOf, type FormState } from "@/lib/services/access";
import {
  RETENTION_RULES, changePassword, updateBusiness, updateInvoicing, updateJobDefaults, updatePlanner, updateRetention, updateTaxes,
} from "@/lib/services/settings";
import { assignRounds, createRole, createUser, deleteRole, removeUser, updateRole, updateUser } from "@/lib/services/users";

const s = (f: FormData, k: string) => (f.get(k) as string | null) ?? undefined;

async function run(fn: () => Promise<unknown>, path = "/settings", ok = "Saved"): Promise<FormState> {
  try { await fn(); } catch (e) { return errorsOf(e); }
  revalidatePath(path);
  return { ok };
}

export async function businessAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => updateBusiness(user, {
    businessName: s(f, "businessName") ?? "", address: s(f, "address"), phone: s(f, "phone"), website: s(f, "website"),
    yearEndDay: s(f, "yearEndDay") as unknown as number, yearEndMonth: s(f, "yearEndMonth") as unknown as number,
  }));
}

export async function taxesAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => updateTaxes(user, { collectsVat: f.get("collectsVat") === "on", vatRatePercent: s(f, "vatRatePercent") as unknown as number }));
}

export async function invoicingAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => updateInvoicing(user, {
    invoiceTitle: s(f, "invoiceTitle"), invoiceNotes: s(f, "invoiceNotes"), invoiceSmallPrint: s(f, "invoiceSmallPrint"),
    defaultJobDescription: s(f, "defaultJobDescription"),
    paymentTermsType: s(f, "paymentTermsType") as "not_required",
    paymentTermsDays: (s(f, "paymentTermsDays") || 0) as unknown as number,
    showNextDueOnInvoices: f.get("showNextDueOnInvoices") === "on",
  }));
}

export async function plannerAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => updatePlanner(user, {
    daysWorked: maskFromDays(f.getAll("daysWorked").map(Number)),
    firstWeekDay: s(f, "firstWeekDay") as unknown as number,
    addJobsOrder: s(f, "addJobsOrder") as "next_due",
    replanFrom: s(f, "replanFrom") as "last_job",
    defaultPaid: s(f, "defaultPaid") as "job_price",
    autoMarkPolicy: s(f, "autoMarkPolicy") as "assume_not_done",
    autoMarkAfterDays: s(f, "autoMarkAfterDays") as unknown as number,
  }));
}

export async function jobDefaultsAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => updateJobDefaults(user, { defaultTimeRequired: Number(s(f, "hours") ?? 0) * 60 + Number(s(f, "minutes") ?? 0) }));
}

export async function retentionAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(RETENTION_RULES.map((r) => [r.key, {
    enabled: f.get(`${r.key}.enabled`) === "on",
    num: s(f, `${r.key}.num`) as unknown as number,
    unit: s(f, `${r.key}.unit`) as "month",
  }]));
  return run(() => updateRetention(user, raw));
}

export async function passwordAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  return run(() => changePassword(user, s(f, "current") ?? "", s(f, "password") ?? "", s(f, "confirmation") ?? ""), "/settings", "Password changed");
}

// ---------- Users ----------

function userFrom(f: FormData) {
  return {
    email: s(f, "email") ?? "", name: s(f, "name") ?? "", phone: s(f, "phone"),
    roleId: s(f, "roleId") || null, managerId: s(f, "managerId") || null,
    password: s(f, "password") ?? "", passwordConfirmation: s(f, "passwordConfirmation") ?? "",
  };
}

export async function createUserAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await createUser(user, userFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function updateUserAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await updateUser(user, id, userFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function removeUserAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await removeUser(user, id); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/users");
  redirect("/settings/users");
}

// ---------- Roles ----------

const roleFrom = (f: FormData) => ({ name: s(f, "name") ?? "", permissions: f.getAll("permissions").map(String) });

export async function createRoleAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await createRole(user, roleFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

export async function updateRoleAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await updateRole(user, id, roleFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

export async function deleteRoleAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await deleteRole(user, id); } catch (e) { return errorsOf(e); }
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

// ---------- Round assignments ----------

export async function assignRoundsAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const assignments: Record<string, string | null> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("round.")) assignments[k.slice(6)] = (v as string) || null;
  return run(() => assignRounds(user, assignments), "/settings/round-assignments");
}
