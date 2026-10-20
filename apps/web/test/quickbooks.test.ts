import { afterAll, describe, expect, it, vi } from "vitest";
import { db, pg, schema } from "@/db";
import { signup } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { createCustomerWithJob } from "@/lib/services/customers";
import { addJobToDay, completeJob } from "@/lib/services/planning";
import { createInvoice } from "@/lib/services/invoicing";
import { syncQuickBooks } from "@/lib/services/quickbooks";

afterAll(async () => { await pg.end(); vi.unstubAllGlobals(); });

describe("QuickBooks sync", () => {
  it("pushes customers, invoices and payments once", async () => {
    const { account, user } = await signup({ businessName: "QB Co", name: "Q", email: `qb${Date.now()}@example.com`, password: "password123" });
    await db.insert(schema.integrations).values({ accountId: account.id, provider: "quickbooks", externalId: "realm1",
      secret: encrypt({ access_token: "at", refresh_token: "rt", expires_at: Date.now() + 3_600_000, realmId: "realm1" }), config: {} });
    const { customer, jobSpec } = await createCustomerWithJob(account.id, user.id, { contact: { lastName: "Q", address: "1 Q St" }, paymentMethod: "paper_invoice", invoiceFrequency: "manually" }, { price: 20 }, "2026-10-01");
    const job = await addJobToDay(account.id, user.id, jobSpec.id, "2026-10-01", 0);
    await completeJob(account.id, user.id, job.id, { status: "done", paid: 2000, method: "cash" }, "2026-10-01");
    await createInvoice(account.id, customer.id, "2026-10-01");
    const calls: string[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      const kind = String(url).split("/company/realm1/")[1]!.split("?")[0]!;
      calls.push(kind);
      expect(String(url)).toContain("minorversion=75");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer at");
      const Kind = kind[0]!.toUpperCase() + kind.slice(1);
      return new Response(JSON.stringify({ [Kind]: { Id: String(++n) } }), { status: 200 });
    }));
    expect(await syncQuickBooks(account.id)).toEqual({ pushed: 2, failed: 0 });
    expect(calls).toEqual(["customer", "invoice", "payment"]);
    expect(await syncQuickBooks(account.id)).toEqual({ pushed: 2, failed: 0 });
    expect(calls).toHaveLength(3); // nothing re-sent
  });
});
