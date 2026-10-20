"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createApiToken, revokeApiToken } from "@/lib/services/api";

export async function createTokenAction(_: { token?: string } | undefined, f: FormData) {
  const user = await requireUser("edit_settings");
  const { token } = await createApiToken(user.accountId, user.id, String(f.get("label") || "API token"));
  revalidatePath("/settings/api");
  return { token };
}
export async function revokeTokenAction(id: string) {
  const user = await requireUser("edit_settings");
  await revokeApiToken(user.accountId, id);
  revalidatePath("/settings/api");
}
