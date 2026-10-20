import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { userForApiToken } from "@/lib/services/api";
import { createCustomerWithJob, getCustomer, listCustomers, ValidationError } from "@/lib/services/customers";
import { recordPayment } from "@/lib/services/debts";
import { todayIso } from "@/lib/time";

/**
 * Public REST API, v1. Auth: Authorization: Bearer <personal access token>.
 * GET  /api/v1/customers[?q=]          list customers with their jobs
 * GET  /api/v1/customers/:id           one customer with jobs, payments, invoices
 * POST /api/v1/customers               create {customer, job}
 * GET  /api/v1/jobs?from=&to=          planned/completed visits in a date range
 * POST /api/v1/customers/:id/payments  record {paid (pence), method, reference}
 * GET  /api/v1/invoices                invoices
 */
const json = (body: unknown, status = 200) => Response.json(body, { status });
const err = (status: number, message: string) => json({ error: message }, status);

async function handle(req: Request, path: string[]) {
  const user = await userForApiToken(req.headers.get("authorization"));
  if (!user) return err(401, "Missing or invalid API token");
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.isOwner || user.permissions.has(p) || user.permissions.has("administrator");
  const [resource, id, sub] = path;
  const url = new URL(req.url);

  if (resource === "customers" && req.method === "GET" && !id) {
    const rows = await listCustomers(user.accountId, { search: url.searchParams.get("q") ?? undefined });
    return json({ data: rows.map(({ customer, contact, specs }) => ({ ...customer, contact, jobs: specs.map((s) => ({ ...s.spec, round: s.round?.name ?? null })) })) });
  }
  if (resource === "customers" && req.method === "GET" && id && !sub) {
    const c = await getCustomer(user.accountId, id);
    return c ? json({ data: c }) : err(404, "Not found");
  }
  if (resource === "customers" && req.method === "POST" && !id) {
    if (!can("create_jobs")) return err(403, "Forbidden");
    const body = (await req.json().catch(() => null)) as { customer?: unknown; job?: unknown } | null;
    if (!body?.customer) return err(400, "Body must include customer and job");
    try {
      const r = await createCustomerWithJob(user.accountId, user.id, body.customer as never, (body.job ?? {}) as never, todayIso());
      return json({ data: r }, 201);
    } catch (e) {
      return err(422, e instanceof ValidationError ? e.errors.join("; ") : e instanceof Error ? e.message : "Invalid");
    }
  }
  if (resource === "customers" && id && sub === "payments" && req.method === "POST") {
    if (!can("enter_payments")) return err(403, "Forbidden");
    const b = (await req.json().catch(() => null)) as { paid?: number; method?: string; reference?: string; date?: string } | null;
    if (!b || !Number.isInteger(b.paid)) return err(400, "paid (integer pence) is required");
    try { await recordPayment(user.accountId, user.id, id, { paid: b.paid!, method: b.method ?? "bank_transfer", reference: b.reference ?? null, date: b.date ?? todayIso() }); }
    catch (e) { return err(404, e instanceof Error ? e.message : "Not found"); }
    return json({ ok: true }, 201);
  }
  if (resource === "jobs" && req.method === "GET") {
    const from = url.searchParams.get("from") ?? todayIso(), to = url.searchParams.get("to") ?? from;
    const rows = await db.select().from(schema.jobs).where(and(eq(schema.jobs.accountId, user.accountId), gte(schema.jobs.date, from), lte(schema.jobs.date, to)));
    return json({ data: rows });
  }
  if (resource === "invoices" && req.method === "GET") {
    const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.accountId, user.accountId));
    return json({ data: rows.map(({ viewToken: _t, ...i }) => i) });
  }
  return err(404, "Unknown endpoint");
}

type Ctx = { params: Promise<{ path: string[] }> };
export async function GET(req: Request, ctx: Ctx) { return handle(req, (await ctx.params).path); }
export async function POST(req: Request, ctx: Ctx) { return handle(req, (await ctx.params).path); }
