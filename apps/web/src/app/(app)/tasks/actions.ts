"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { errorsOf, type FormState } from "@/lib/services/access";
import { createTask, deleteTask, updateTask } from "@/lib/services/tasks";

const taskFrom = (f: FormData) => {
  const h = String(f.get("hours") ?? "");
  const m = String(f.get("minutes") ?? "");
  return {
    name: String(f.get("name") ?? ""),
    description: String(f.get("description") ?? ""),
    timeRequired: h === "" && m === "" ? null : Number(h || 0) * 60 + Number(m || 0),
    price: String(f.get("price") ?? ""),
  };
};

export async function createTaskAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await createTask(user, taskFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/tasks");
  return { ok: "Task added" };
}

export async function updateTaskAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  let changed: number;
  try { changed = await updateTask(user, id, taskFrom(f), todayIso()); } catch (e) { return errorsOf(e); }
  revalidatePath("/tasks");
  revalidatePath("/customers");
  return { ok: changed ? `Saved. The price of ${changed} job${changed === 1 ? "" : "s"} was updated.` : "Saved" };
}

export async function deleteTaskAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await deleteTask(user, id); } catch (e) { return errorsOf(e); }
  revalidatePath("/tasks");
  redirect("/tasks");
}
