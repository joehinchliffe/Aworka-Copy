import { afterAll, describe, expect, it } from "vitest";
import { pg } from "@/db";
import { signup } from "@/lib/auth";
import { createApiToken, revokeApiToken } from "@/lib/services/api";
import { GET, POST } from "@/app/api/v1/[...path]/route";

afterAll(async () => { await pg.end(); });
const call = (fn: typeof GET, path: string[], token: string | null, init: RequestInit = {}) =>
  fn(new Request(`http://x/api/v1/${path.join("/")}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" } }), { params: Promise.resolve({ path }) });

describe("public API", () => {
  it("authenticates, creates and lists customers, records payments, revokes", async () => {
    const { account, user } = await signup({ businessName: "Api Co", name: "A", email: `api${Date.now()}@example.com`, password: "password123" });
    const { token, row } = await createApiToken(account.id, user.id, "Zapier");
    expect((await call(GET, ["customers"], null)).status).toBe(401);
    const created = await call(POST, ["customers"], token, { method: "POST", body: JSON.stringify({ customer: { contact: { lastName: "Api", address: "1 Road" } }, job: { price: 12 } }) });
    expect(created.status).toBe(201);
    const id = (await created.json()).data.customer.id;
    expect((await call(POST, ["customers"], token, { method: "POST", body: JSON.stringify({ customer: { contact: {} } }) })).status).toBe(422);
    const pay = await call(POST, ["customers", id, "payments"], token, { method: "POST", body: JSON.stringify({ paid: 500 }) });
    expect(pay.status).toBe(201);
    const list = await (await call(GET, ["customers"], token)).json();
    expect(list.data[0].balance).toBe(500);
    await revokeApiToken(account.id, row.id);
    expect((await call(GET, ["customers"], token)).status).toBe(401);
  });
});
