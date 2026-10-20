"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { errorsOf, type FormState } from "@/lib/services/access";
import { createRound, deleteRound, setRoundOrder, updateRound } from "@/lib/services/rounds";

const roundFrom = (f: FormData) => ({ name: String(f.get("name") ?? ""), otherIncome: f.get("otherIncome") === "on" });

export async function createRoundAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await createRound(user, roundFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/rounds");
  return { ok: "Round added" };
}

export async function updateRoundAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await updateRound(user, id, roundFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/rounds");
  return { ok: "Saved" };
}

export async function deleteRoundAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await deleteRound(user, id); } catch (e) { return errorsOf(e); }
  revalidatePath("/rounds");
  redirect("/rounds");
}

export async function saveRoundOrderAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await setRoundOrder(user, id, f.getAll("order").map(String)); } catch (e) { return errorsOf(e); }
  revalidatePath(`/rounds/${id}/order`);
  return { ok: "Round order saved" };
}
