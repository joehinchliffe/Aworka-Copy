"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { deleteTemplate, saveTemplate } from "@/lib/services/templates";
import { retryMessage, sendToCustomer } from "@/lib/services/messageHistory";
import { buildDrafts, deliverDrafts, discardDrafts, selectCustomers, type DraftChannel, type DraftSelection, type DraftSkip } from "@/lib/services/drafts";
import { clampDays, JOB_SHEET_STATUSES, type JobSheetStatus } from "@/lib/services/jobSheets";

export type FormState = { errors?: string[] } | undefined;
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export async function saveTemplateAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("send_messages");
  try {
    await saveTemplate(user.accountId, id, {
      name: String(f.get("name") ?? ""), purpose: String(f.get("purpose") ?? "general"),
      emailSubject: f.get("emailSubject") as string | null, emailBody: f.get("emailBody") as string | null, smsBody: f.get("smsBody") as string | null,
    });
  } catch (e) { return { errors: [msg(e)] }; }
  revalidatePath("/messages/templates");
  redirect("/messages/templates");
}

export async function deleteTemplateAction(id: string) {
  const user = await requireUser("send_messages");
  await deleteTemplate(user.accountId, id);
  revalidatePath("/messages/templates");
  redirect("/messages/templates");
}

export async function sendToCustomerAction(customerId: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("send_messages");
  let id: string;
  try {
    const m = await sendToCustomer(user.accountId, customerId, {
      channel: f.get("channel") === "sms" ? "sms" : "email",
      subject: f.get("subject") as string | null, body: String(f.get("body") ?? ""), purpose: String(f.get("purpose") ?? "general"),
    });
    id = m.id;
  } catch (e) { return { errors: [msg(e)] }; }
  revalidatePath("/messages");
  redirect(`/messages/${id}`);
}

export async function retryMessageAction(id: string) {
  const user = await requireUser("send_messages");
  await retryMessage(user.accountId, id);
  revalidatePath(`/messages/${id}`);
}

export type DraftState = { errors?: string[]; created?: number; skipped?: DraftSkip[] } | undefined;

/** Turn the posted selection fields into a DraftSelection. */
function selectionFrom(f: FormData): DraftSelection {
  const source = String(f.get("source") ?? "");
  if (source === "round") {
    const roundId = String(f.get("roundId") ?? "");
    if (!roundId) throw new Error("Choose a round");
    return { kind: "round", roundId };
  }
  if (source === "job_sheet") {
    const status = String(f.get("status") ?? "all");
    const user = String(f.get("user") ?? "all");
    return {
      kind: "job_sheet", start: String(f.get("start") ?? ""), days: clampDays(f.get("days")),
      status: (status in JOB_SHEET_STATUSES ? status : "all") as JobSheetStatus, userId: user === "all" ? null : user,
    };
  }
  if (source === "debt") return { kind: "debt" };
  if (source === "customers") return { kind: "customers", customerIds: f.getAll("customerId").map(String) };
  throw new Error("Choose who to message");
}

export async function buildDraftsAction(_: DraftState, f: FormData): Promise<DraftState> {
  const user = await requireUser("send_messages");
  try {
    const templateId = String(f.get("templateId") ?? "");
    if (!templateId) throw new Error("Choose a template");
    const channel = (["email", "sms", "preferred"].includes(String(f.get("channel"))) ? f.get("channel") : "preferred") as DraftChannel;
    const ids = await selectCustomers(user.accountId, selectionFrom(f));
    if (ids.length === 0) throw new Error("No customers match that selection");
    const { created, skipped } = await buildDrafts(user.accountId, ids, templateId, channel);
    revalidatePath("/messages/drafts");
    return { created: created.length, skipped };
  } catch (e) { return { errors: [msg(e)] }; }
}

export async function deliverDraftsAction(f: FormData) {
  const user = await requireUser("send_messages");
  const ids = f.getAll("id").map(String);
  await deliverDrafts(user.accountId, f.get("all") ? undefined : ids);
  revalidatePath("/messages", "layout");
  redirect("/messages?status=queued");
}

export async function discardDraftsAction(f: FormData) {
  const user = await requireUser("send_messages");
  const ids = f.getAll("id").map(String);
  await discardDrafts(user.accountId, f.get("all") ? undefined : ids);
  revalidatePath("/messages/drafts");
}
