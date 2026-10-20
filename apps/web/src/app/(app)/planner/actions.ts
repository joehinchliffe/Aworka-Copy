"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { accountFor } from "@/lib/lookups";
import { addJobToDay, completeJob, moveJob, nudgeToDate, optimiseDay, removeJob, reorderDay, type CompleteJobInput } from "@/lib/services/planning";

export async function addJobsAction(date: string, f: FormData) {
  const user = await requireUser("add_jobs");
  const account = await accountFor(user.accountId);
  for (const specId of f.getAll("specId")) {
    try { await addJobToDay(user.accountId, user.id, String(specId), date, account?.collectsVat ? account.vatRate : 0); } catch { /* already planned */ }
  }
  revalidatePath("/planner", "layout");
}

export async function moveJobAction(jobId: string, date: string) {
  const user = await requireUser("move_jobs");
  await moveJob(user.accountId, jobId, date);
  revalidatePath("/planner", "layout");
}

/** Planning a projected (future) job by dragging it creates the real job. */
export async function planProjectedAction(specId: string, date: string) {
  const user = await requireUser("add_jobs");
  const account = await accountFor(user.accountId);
  await addJobToDay(user.accountId, user.id, specId, date, account?.collectsVat ? account.vatRate : 0);
  revalidatePath("/planner", "layout");
}

export async function removeJobAction(jobId: string) {
  const user = await requireUser("remove_jobs");
  await removeJob(user.accountId, jobId);
  revalidatePath("/planner", "layout");
}

export async function reorderDayAction(ids: string[]) {
  const user = await requireUser("move_jobs");
  await reorderDay(user.accountId, ids);
  revalidatePath("/planner", "layout");
}

export async function nudgeAction(fromDate: string, toDate: string) {
  const user = await requireUser("move_jobs");
  await nudgeToDate(user.accountId, fromDate, toDate);
  revalidatePath("/planner", "layout");
}

export async function completeJobAction(jobId: string, f: FormData) {
  const user = await requireUser("enter_payments");
  const pounds = (k: string) => (f.get(k) ? Math.round(Number(f.get(k)) * 100) : undefined);
  const input: CompleteJobInput = {
    status: String(f.get("status")) as CompleteJobInput["status"],
    paid: pounds("paid"),
    includesTip: f.get("includesTip") === "on",
    method: String(f.get("method") ?? "cash"),
    price: user.permissions.has("adjust_prices") ? pounds("price") : undefined,
    permanent: f.get("permanent") === "on",
    notes: (f.get("notes") as string) ?? undefined,
    confirmed: f.get("confirmed") === null ? undefined : f.get("confirmed") === "on",
    planNext: f.get("planNext") === "no" ? { mode: "no" } : f.get("planNext") === "on_date" ? { mode: "on_date", date: String(f.get("planNextDate")) } : { mode: "auto" },
  };
  await completeJob(user.accountId, user.id, jobId, input, todayIso());
  revalidatePath("/planner", "layout");
}

export async function optimiseDayAction(date: string, f: FormData) {
  const user = await requireUser("move_jobs");
  await optimiseDay(user.accountId, date, {
    start: (f.get("start") as "home" | "furthest") ?? undefined,
    finish: (f.get("finish") as "home" | "furthest" | "anywhere") ?? undefined,
  });
  revalidatePath("/planner", "layout");
}
