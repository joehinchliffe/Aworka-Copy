"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { clampDays, JOB_SHEET_STATUSES, jobSheet, jobSheetText, saveDayNotes, type JobSheetStatus } from "@/lib/services/jobSheets";
import { queueMessage } from "@/lib/services/messaging";

export async function saveDayNotesAction(sheetUserId: string | null, date: string, f: FormData) {
  const user = await requireUser("edit_jobs");
  await saveDayNotes(user.accountId, sheetUserId, date, (f.get("topNotes") as string) ?? null, (f.get("bottomNotes") as string) ?? null);
  revalidatePath("/job-sheets");
}

export async function emailJobSheetAction(q: { start: string; days: number; status: string; userId: string | null; userLabel: string }) {
  const user = await requireUser();
  const status = (q.status in JOB_SHEET_STATUSES ? q.status : "all") as JobSheetStatus;
  const days = clampDays(q.days);
  const sheet = await jobSheet(user.accountId, { start: q.start, days, status, userId: q.userId });
  const heading = `Job sheet for ${q.userLabel}: ${formatDate(q.start)}${days > 1 ? ` (${days} days)` : ""} - ${JOB_SHEET_STATUSES[status]}`;
  await queueMessage(user.accountId, { channel: "email", reason: "job_sheet", to: user.email, subject: heading, body: jobSheetText(sheet, heading) });
  redirect(`/job-sheets?date=${q.start}&days=${days}&status=${status}&user=${q.userId ?? "all"}&emailed=1`);
}
