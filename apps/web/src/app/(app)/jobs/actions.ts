"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { maskFromDays } from "@rounds/domain";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { setJobSpecStatus, updateJobSpec, ValidationError, type JobSpecInput } from "@/lib/services/customers";

type FormState = { errors?: string[] } | undefined;
const s = (f: FormData, k: string) => (f.get(k) as string | null) ?? undefined;

export async function updateJobSpecAction(id: string, customerId: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("edit_job_details");
  const input: JobSpecInput = {
    reference: s(f, "jobReference"),
    roundId: s(f, "roundId") && s(f, "roundId") !== "new" ? s(f, "roundId") : null,
    newRoundName: s(f, "roundId") === "new" ? s(f, "newRoundName") : undefined,
    taskId: s(f, "taskId") || null, description: s(f, "description"), notes: s(f, "jobNotes"),
    price: s(f, "price") as unknown as number, vatStatus: s(f, "vatStatus") as JobSpecInput["vatStatus"],
    timeRequired: Number(s(f, "timeHours") ?? 0) * 60 + Number(s(f, "timeMinutes") ?? 0),
    regularity: s(f, "regularity") as JobSpecInput["regularity"], timesPerPeriod: s(f, "timesPerPeriod") as unknown as number,
    numPeriods: s(f, "numPeriods") as unknown as number, periodUnit: s(f, "periodUnit") as JobSpecInput["periodUnit"],
    allowedDays: maskFromDays(f.getAll("allowedDays").map(Number)), appointments: s(f, "appointments") as JobSpecInput["appointments"],
    firstDueOn: s(f, "firstDueOn") || null,
  };
  try { await updateJobSpec(user.accountId, user.id, id, input, todayIso()); }
  catch (e) { return { errors: e instanceof ValidationError ? e.errors : [e instanceof Error ? e.message : "Could not save"] }; }
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function setStatusAction(id: string, status: "active" | "suspended" | "deleted") {
  const user = await requireUser(status === "deleted" ? "delete_jobs" : "suspend_jobs");
  const customerId = await setJobSpecStatus(user.accountId, id, status, todayIso());
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}
