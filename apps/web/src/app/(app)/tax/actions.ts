"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { accountFor } from "@/lib/lookups";
import { authorizeUrl, fraudHeaders, submitVatReturn, type ClientFacts } from "@/lib/services/hmrc";
import { computeVatReturn, toHmrcBody } from "@/lib/services/vat";
import { cumulativeSummary, submitCumulative, taxYearLabel } from "@/lib/services/incomeTax";

async function fraudFrom(f: FormData, userEmail: string) {
  const h = await headers();
  const facts = JSON.parse(String(f.get("fraudFacts") || "{}")) as Partial<ClientFacts>;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "127.0.0.1";
  return fraudHeaders({
    deviceId: facts.deviceId ?? "unknown", userId: userEmail, publicIp: ip, publicIpTimestamp: new Date().toISOString(),
    userAgent: facts.userAgent ?? h.get("user-agent") ?? "", screens: facts.screens ?? { width: 0, height: 0, scalingFactor: 1, colourDepth: 24 },
    windowSize: facts.windowSize ?? { width: 0, height: 0 }, timezoneOffsetMinutes: facts.timezoneOffsetMinutes ?? 0,
  }, { publicIp: process.env.SERVER_PUBLIC_IP ?? ip, version: process.env.APP_VERSION ?? "0.1.0" });
}

export async function saveTaxSettingsAction(f: FormData) {
  const user = await requireUser("edit_settings");
  const account = await accountFor(user.accountId);
  if (!account) return;
  const scheme = String(f.get("scheme") ?? "standard") as NonNullable<typeof account.settings.vatRegistration>["scheme"];
  await db.update(schema.accounts).set({ settings: {
    ...account.settings,
    vatRegistration: { regNo: String(f.get("regNo") ?? "").replace(/\s/g, ""), scheme, flatRate: Number(f.get("flatRate") || 0) / 100 },
    incomeTax: { nino: String(f.get("nino") ?? "").toUpperCase().replace(/\s/g, ""), businessId: String(f.get("businessId") ?? ""), basis: f.get("basis") === "accrual" ? "accrual" : "cash", consolidated: f.get("consolidated") === "on" },
  } }).where(eq(schema.accounts.id, user.accountId));
  revalidatePath("/tax");
}

export async function connectHmrcAction(f: FormData) {
  const user = await requireUser("edit_settings");
  redirect(authorizeUrl(user.accountId, (f.get("scope") as "vat" | "income_tax" | "vat_and_income_tax") ?? "vat"));
}

export type SubmitState = { ok?: string; error?: string } | undefined;

export async function submitVatAction(_: SubmitState, f: FormData): Promise<SubmitState> {
  const user = await requireUser("edit_settings");
  const account = await accountFor(user.accountId);
  const reg = account?.settings.vatRegistration;
  if (!account || !reg?.regNo) return { error: "Enter your VAT registration number first" };
  try {
    const r = await computeVatReturn(user.accountId, { ...reg, rate: account.vatRate }, String(f.get("start")), String(f.get("end")));
    await submitVatReturn(user.accountId, reg.regNo, toHmrcBody(String(f.get("periodKey")), r), await fraudFrom(f, user.email));
    return { ok: "VAT return submitted to HMRC" };
  } catch (e) { return { error: e instanceof Error ? e.message : "Submission failed" }; }
}

export async function submitIncomeTaxAction(_: SubmitState, f: FormData): Promise<SubmitState> {
  const user = await requireUser("edit_settings");
  const account = await accountFor(user.accountId);
  const it = account?.settings.incomeTax;
  if (!account || !it?.nino || !it.businessId) return { error: "Enter your National Insurance number and HMRC business ID first" };
  try {
    const start = String(f.get("start")), end = String(f.get("end"));
    const summary = await cumulativeSummary(user.accountId, start, end, { basis: it.basis ?? "cash", consolidated: it.consolidated });
    await submitCumulative(user.accountId, it.nino, it.businessId, taxYearLabel(end), summary, await fraudFrom(f, user.email));
    return { ok: "Quarterly update submitted to HMRC" };
  } catch (e) { return { error: e instanceof Error ? e.message : "Submission failed" }; }
}
