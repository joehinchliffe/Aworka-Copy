"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { deleteEvent, saveEvent, setToDoDone, type EventInput } from "@/lib/services/calendar";

export type FormState = { errors?: string[] } | undefined;

const eventFrom = (f: FormData, userId: string): EventInput => ({
  type: f.get("type") === "to_do" ? "to_do" : "event",
  date: String(f.get("date") ?? ""),
  time: (f.get("time") as string) || null,
  summary: String(f.get("summary") ?? ""),
  details: (f.get("details") as string) || null,
  userId,
});

export async function saveEventAction(id: string | null, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("create_events");
  try { await saveEvent(user.accountId, id, eventFrom(f, user.id)); } catch (e) { return { errors: [e instanceof Error ? e.message : "Something went wrong"] }; }
  revalidatePath("/events");
  redirect("/events");
}

export async function toggleToDoAction(id: string, done: boolean) {
  const user = await requireUser("create_events");
  await setToDoDone(user.accountId, id, done);
  revalidatePath("/events");
}

export async function deleteEventAction(id: string) {
  const user = await requireUser("create_events");
  await deleteEvent(user.accountId, id);
  revalidatePath("/events");
  redirect("/events");
}
