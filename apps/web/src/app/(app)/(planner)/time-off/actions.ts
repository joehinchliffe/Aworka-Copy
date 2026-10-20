"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { addTimeOff, deleteTimeOff } from "@/lib/services/calendar";

export type FormState = { errors?: string[]; ok?: boolean; savedAt?: number } | undefined;

export async function addTimeOffAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser("book_time_off");
  try {
    await addTimeOff(user.accountId, {
      startOn: String(f.get("startOn") ?? ""), endOn: String(f.get("endOn") ?? ""),
      reason: (f.get("reason") as string) || null, notes: (f.get("notes") as string) || null, userId: user.id,
    });
  } catch (e) { return { errors: [e instanceof Error ? e.message : "Something went wrong"] }; }
  revalidatePath("/time-off");
  return { ok: true, savedAt: Date.now() };
}

export async function deleteTimeOffAction(id: string) {
  const user = await requireUser("book_time_off");
  await deleteTimeOff(user.accountId, id);
  revalidatePath("/time-off");
}
