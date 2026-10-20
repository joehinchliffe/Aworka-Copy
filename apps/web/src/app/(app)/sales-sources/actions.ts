"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { errorsOf, type FormState } from "@/lib/services/access";
import { createSalesSource, deleteSalesSource, updateSalesSource } from "@/lib/services/salesSources";

const sourceFrom = (f: FormData) => ({
  type: String(f.get("type") ?? ""), reference: String(f.get("reference") ?? ""), notes: String(f.get("notes") ?? ""),
});

export async function createSalesSourceAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await createSalesSource(user, sourceFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/sales-sources");
  return { ok: "Sales source added" };
}

export async function updateSalesSourceAction(id: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await updateSalesSource(user, id, sourceFrom(f)); } catch (e) { return errorsOf(e); }
  revalidatePath("/sales-sources");
  redirect("/sales-sources");
}

export async function deleteSalesSourceAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await deleteSalesSource(user, id); } catch (e) { return errorsOf(e); }
  revalidatePath("/sales-sources");
  redirect("/sales-sources");
}
