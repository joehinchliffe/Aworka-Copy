import { db, schema } from "@/db";
import { autoMarkStaleJobs } from "./planning";
import { runNightlyInvoicing } from "./invoicing";
import { geocodePending } from "./geocoding";
import { syncQuickBooks } from "./quickbooks";

export type NightlyStep = (accountId: string, today: string) => Promise<unknown>;

/** Steps run once a night for every account, in order. Other modules register theirs here. */
export const nightlySteps: Record<string, NightlyStep> = {
  autoMarkStaleJobs,
  runNightlyInvoicing,
  geocodePending: (accountId) => geocodePending(accountId),
  syncQuickBooks: (accountId) => syncQuickBooks(accountId),
};

export async function runNightly(today: string) {
  const accounts = await db.select({ id: schema.accounts.id }).from(schema.accounts);
  const report: Record<string, Record<string, unknown>> = {};
  for (const a of accounts) {
    report[a.id] = {};
    for (const [name, step] of Object.entries(nightlySteps)) {
      try { report[a.id]![name] = await step(a.id, today); }
      catch (e) { report[a.id]![name] = `error: ${e instanceof Error ? e.message : String(e)}`; }
    }
  }
  return report;
}
