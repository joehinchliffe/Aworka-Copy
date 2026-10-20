"use server";
import { revalidatePath } from "next/cache";
import { importCustomersCsv, type ImportResult } from "@/lib/services/importExport";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/time";

export async function importAction(_: ImportResult | undefined, f: FormData): Promise<ImportResult> {
  const user = await requireUser("create_jobs");
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { imported: 0, skipped: [{ row: 0, reason: "Choose a CSV file" }] };
  if (file.size > 5_000_000) return { imported: 0, skipped: [{ row: 0, reason: "File is larger than 5 MB" }] };
  const result = await importCustomersCsv(user.accountId, user.id, await file.text(), todayIso());
  revalidatePath("/customers");
  return result;
}
