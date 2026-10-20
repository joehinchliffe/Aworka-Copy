import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import { pg } from "@/db";
import { signup } from "@/lib/auth";
import { exportCustomersCsv, importCustomersCsv, mapHeaders } from "@/lib/services/importExport";
import { listCustomers } from "@/lib/services/customers";

describe("csv", () => {
  it("parses quotes, commas and newlines", () => {
    expect(parseCsv('a,"b, c","d ""q"""\r\n1,"two\nlines",3\n')).toEqual([["a", "b, c", 'd "q"'], ["1", "two\nlines", "3"]]);
    expect(parseCsv(toCsv([["x", 'y"z', "1,2"]]))).toEqual([["x", 'y"z', "1,2"]]);
  });
  it("maps common header names", () => {
    expect(mapHeaders(["Surname", "Post Code", "Next Due Date", "Freq"])).toEqual({ lastName: 0, postcode: 1, nextDue: 2, frequencyWeeks: 3 });
  });
});

describe("import/export", () => {
  let accountId = "", userId = "";
  beforeAll(async () => {
    const { account, user } = await signup({ businessName: "Import Co", name: "I", email: `imp${Date.now()}@example.com`, password: "password123" });
    accountId = account.id; userId = user.id;
  });
  afterAll(async () => { await pg.end(); });

  it("imports rows, creates rounds and reports bad rows", async () => {
    const csv = [
      "Name,Address,Postcode,Round,Price,Frequency,Next due,Payment method,Owed",
      "Ann Smith,1 High St,LS1 1AA,Monday,15.00,4,03/11/2026,Cash,10",
      "Bob Jones,2 Low Rd,LS2 2BB,Monday,£20,8,,email invoice,",
      ",,,,,,,,",
      "No Address Person,,,,5,,,,",
    ].join("\n");
    const r = await importCustomersCsv(accountId, userId, csv, "2026-10-20");
    expect(r.imported).toBe(3);
    const list = await listCustomers(accountId);
    const ann = list.find((c) => c.contact.lastName === "Smith")!;
    expect(ann.customer.balance).toBe(-1000);
    expect(ann.specs[0]?.spec.nextDueOn).toBe("2026-11-03");
    expect(ann.specs[0]?.round?.name).toBe("Monday");
    const bob = list.find((c) => c.contact.lastName === "Jones")!;
    expect(bob.customer.paymentMethod).toBe("paper_invoice"); // no email address
    expect(bob.specs[0]?.round?.id).toBe(ann.specs[0]?.round?.id);
    const out = await exportCustomersCsv(accountId);
    expect(parseCsv(out).length).toBe(4);
  });
});
