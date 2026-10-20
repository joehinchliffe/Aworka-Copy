"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { errorsOf, type FormState } from "@/lib/services/access";
import { applyRevision, revertJob, revertRevision, revisionForm } from "@/lib/services/priceRevisions";

const FIELDS = ["roundId", "priceMin", "priceMax", "changedOnOrBefore", "kind", "percentage", "fixed", "roundTo", "minimumChange"] as const;

export async function applyRevisionAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  let id: string;
  try {
    const req = revisionForm.parse(Object.fromEntries(FIELDS.map((k) => [k, (f.get(k) as string | null) ?? undefined])));
    id = (await applyRevision(user, req, todayIso())).id;
  } catch (e) { return errorsOf(e); }
  revalidatePath("/price-revisions");
  revalidatePath("/customers");
  redirect(`/price-revisions/${id}`);
}

export async function revertRevisionAction(id: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  let r: { reverted: number; skipped: number };
  try { r = await revertRevision(user, id, todayIso()); } catch (e) { return errorsOf(e); }
  revalidatePath(`/price-revisions/${id}`);
  revalidatePath("/price-revisions");
  return { ok: `Reverted ${r.reverted} job${r.reverted === 1 ? "" : "s"}${r.skipped ? `; ${r.skipped} skipped because a later revision or price edit changed them` : ""}.` };
}

export async function revertJobAction(revisionId: string, jobSpecId: string, _: FormState, _f: FormData): Promise<FormState> {
  const user = await requireUser();
  try { await revertJob(user, jobSpecId, todayIso()); } catch (e) { return errorsOf(e); }
  revalidatePath(`/price-revisions/${revisionId}`);
  return { ok: "Reverted" };
}
