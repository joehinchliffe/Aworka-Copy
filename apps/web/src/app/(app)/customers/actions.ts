"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { maskFromDays } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import {
  addAdjustment, addJobSpec, anonymiseCustomer, createCustomerWithJob, updateCustomer, ValidationError,
  type CustomerInput, type JobSpecInput,
} from "@/lib/services/customers";

export type FormState = { errors?: string[] } | undefined;

const s = (f: FormData, k: string) => (f.get(k) as string | null) ?? undefined;

function contactFrom(f: FormData, prefix: string) {
  return {
    title: s(f, `${prefix}title`), firstNames: s(f, `${prefix}firstNames`), lastName: s(f, `${prefix}lastName`),
    company: s(f, `${prefix}company`), address: s(f, `${prefix}address`), postcode: s(f, `${prefix}postcode`),
    phone1: s(f, `${prefix}phone1`), phone2: s(f, `${prefix}phone2`), email: s(f, `${prefix}email`), emailCc: s(f, `${prefix}emailCc`),
  };
}

function customerFrom(f: FormData): CustomerInput {
  return {
    contact: contactFrom(f, "c_"),
    reference: s(f, "reference"),
    contactMethod: s(f, "contactMethod") as CustomerInput["contactMethod"],
    acceptsMarketing: f.get("acceptsMarketing") === "on",
    paymentMethod: s(f, "paymentMethod") as CustomerInput["paymentMethod"],
    invoiceFrequency: s(f, "invoiceFrequency") as CustomerInput["invoiceFrequency"],
    invoicePeriodNum: s(f, "invoicePeriodNum") as unknown as number,
    invoicePeriodUnit: s(f, "invoicePeriodUnit") as CustomerInput["invoicePeriodUnit"],
    invoiceJobsThreshold: s(f, "invoiceJobsThreshold") as unknown as number,
    invoiceValueThreshold: s(f, "invoiceValueThreshold") ? (s(f, "invoiceValueThreshold") as unknown as number) : null,
    paymentTermsType: (s(f, "paymentTermsType") || null) as CustomerInput["paymentTermsType"],
    paymentTermsDays: s(f, "paymentTermsDays") ? (s(f, "paymentTermsDays") as unknown as number) : null,
    notes: s(f, "notes"),
    startingBalance: s(f, "startingBalance") as unknown as number,
  };
}

function jobFrom(f: FormData): JobSpecInput {
  const days = f.getAll("allowedDays").map(Number);
  return {
    estimate: f.get("estimate") === "on",
    location: s(f, "location") as JobSpecInput["location"],
    jobContact: s(f, "location") === "other" ? contactFrom(f, "j_") : undefined,
    reference: s(f, "jobReference"),
    roundId: s(f, "roundId") && s(f, "roundId") !== "new" ? s(f, "roundId") : null,
    newRoundName: s(f, "roundId") === "new" ? s(f, "newRoundName") : undefined,
    taskId: s(f, "taskId") || null,
    description: s(f, "description"),
    notes: s(f, "jobNotes"),
    price: s(f, "price") as unknown as number,
    vatStatus: s(f, "vatStatus") as JobSpecInput["vatStatus"],
    timeRequired: Number(s(f, "timeHours") ?? 0) * 60 + Number(s(f, "timeMinutes") ?? 0),
    regularity: s(f, "regularity") as JobSpecInput["regularity"],
    timesPerPeriod: s(f, "timesPerPeriod") as unknown as number,
    numPeriods: s(f, "numPeriods") as unknown as number,
    periodUnit: s(f, "periodUnit") as JobSpecInput["periodUnit"],
    allowedDays: maskFromDays(days),
    appointments: s(f, "appointments") as JobSpecInput["appointments"],
    firstDueOn: s(f, "firstDueOn") || null,
  };
}

function errorsOf(e: unknown): FormState {
  if (e instanceof ValidationError) return { errors: e.errors };
  if (e && typeof e === "object" && "issues" in e) return { errors: (e as { issues: { path: unknown[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { errors: [e instanceof Error ? e.message : "Something went wrong"] };
}

export async function createCustomerAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("create_jobs");
  let id: string;
  try {
    const r = await createCustomerWithJob(user.accountId, user.id, customerFrom(f), jobFrom(f), todayIso());
    id = r.customer.id;
  } catch (e) { return errorsOf(e); }
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

export async function updateCustomerAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("edit_job_details");
  try { await updateCustomer(user.accountId, id, customerFrom(f), todayIso()); } catch (e) { return errorsOf(e); }
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

export async function addJobAction(customerId: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("create_jobs");
  try { await addJobSpec(user.accountId, user.id, customerId, jobFrom(f), todayIso()); } catch (e) { return errorsOf(e); }
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function adjustmentAction(customerId: string, f: FormData) {
  const type = String(f.get("type"));
  const user = await requireUser(type === "bad_debt" ? "write_off_debts" : "enter_payments");
  const pounds = Number(f.get("amount") ?? 0);
  await addAdjustment(user.accountId, user.id, customerId, type, Math.round(pounds * 100), (f.get("notes") as string) || null, todayIso());
  revalidatePath(`/customers/${customerId}`);
}

export async function anonymiseAction(customerId: string) {
  const user = await requireUser("delete_jobs");
  await anonymiseCustomer(user.accountId, customerId);
  revalidatePath(`/customers/${customerId}`);
}
