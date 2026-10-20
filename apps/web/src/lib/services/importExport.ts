import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCsv, toCsv } from "@/lib/csv";
import { createCustomerWithJob, listCustomers, type CustomerInput, type JobSpecInput } from "./customers";
import { contactName } from "./ledger";

/** Header aliases (lower-cased, punctuation stripped) to our fields. Covers common exports from other round software. */
const ALIASES: Record<string, string[]> = {
  title: ["title"],
  firstNames: ["firstname", "firstnames", "forename", "first"],
  lastName: ["lastname", "surname", "last"],
  name: ["name", "customer", "customername", "fullname", "contact"],
  company: ["company", "business", "companyname"],
  address: ["address", "address1", "addressline1", "street", "jobaddress", "customeraddress"],
  address2: ["address2", "addressline2", "town", "city"],
  postcode: ["postcode", "postalcode", "zip"],
  phone: ["phone", "telephone", "tel", "mobile", "phone1"],
  email: ["email", "emailaddress"],
  reference: ["reference", "ref", "customerref", "jobref"],
  round: ["round", "roundname", "area"],
  price: ["price", "cost", "amount", "jobprice"],
  frequencyWeeks: ["frequency", "freq", "frequencyweeks", "weeks", "interval", "every"],
  nextDue: ["nextdue", "nextduedate", "due", "duedate", "nextclean"],
  paymentMethod: ["paymentmethod", "pays", "payment"],
  balance: ["balance"],
  owed: ["owed", "debt", "amountowed", "owes"],
  notes: ["notes", "note", "comments"],
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export function mapHeaders(headers: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(ALIASES)) if (out[field] === undefined && aliases.includes(n)) out[field] = i;
  });
  return out;
}

function parseDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // UK day/month/year
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  }
  return null;
}

function paymentMethod(s: string): CustomerInput["paymentMethod"] {
  const n = norm(s);
  if (n.includes("email")) return "email_invoice";
  if (n.includes("invoice") || n.includes("paper")) return "paper_invoice";
  if (n.includes("direct") && n.includes("debit") || n.includes("gocardless") || n === "dd") return "direct_debit";
  if (n.includes("bank") || n.includes("transfer") || n === "bacs") return "direct_to_bank";
  if (n.includes("card")) return "card";
  if (n.includes("online")) return "online";
  return "on_day";
}

/** "Balance" uses our convention (negative = customer owes); "Owed" is a positive debt. Returns pounds. */
function startingBalance(balance: string, owed: string): number {
  const num = (v: string) => Number(v.replace(/[£,\s]/g, "")) || 0;
  if (owed) return -num(owed);
  return num(balance);
}

export interface ImportResult { imported: number; skipped: { row: number; reason: string }[] }

export async function importCustomersCsv(accountId: string, userId: string, csv: string, today: string): Promise<ImportResult> {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { imported: 0, skipped: [{ row: 1, reason: "No data rows" }] };
  const map = mapHeaders(rows[0]!);
  const get = (r: string[], f: string) => (map[f] !== undefined ? (r[map[f]!] ?? "").trim() : "");
  const rounds = new Map((await db.select().from(schema.rounds).where(eq(schema.rounds.accountId, accountId))).map((r) => [r.name.toLowerCase(), r.id]));
  const result: ImportResult = { imported: 0, skipped: [] };
  for (const [i, r] of rows.slice(1).entries()) {
    let first = get(r, "firstNames"), last = get(r, "lastName");
    const full = get(r, "name");
    if (!first && !last && full) { const parts = full.split(/\s+/); last = parts.pop() ?? ""; first = parts.join(" "); }
    const address = [get(r, "address"), get(r, "address2")].filter(Boolean).join("\n");
    const weeks = Number(get(r, "frequencyWeeks").replace(/[^0-9.]/g, "")) || 0;
    const roundName = get(r, "round");
    let roundId: string | null = null;
    let newRoundName: string | undefined;
    if (roundName) { roundId = rounds.get(roundName.toLowerCase()) ?? null; if (!roundId) newRoundName = roundName; }
    const customer: CustomerInput = {
      contact: { title: get(r, "title"), firstNames: first, lastName: last, company: get(r, "company"), address, postcode: get(r, "postcode"), phone1: get(r, "phone"), email: get(r, "email") },
      reference: get(r, "reference").slice(0, 15) || undefined,
      paymentMethod: get(r, "paymentMethod") ? paymentMethod(get(r, "paymentMethod")) : "on_day",
      notes: get(r, "notes"),
      startingBalance: startingBalance(get(r, "balance"), get(r, "owed")),
    };
    if (customer.paymentMethod === "email_invoice" && !customer.contact.email) customer.paymentMethod = "paper_invoice";
    const job: JobSpecInput = {
      reference: address ? undefined : get(r, "reference") || full || last || undefined,
      location: address ? "customer" : "none",
      roundId, newRoundName,
      price: Number(get(r, "price").replace(/[£,\s]/g, "")) || 0,
      regularity: weeks > 0 ? "regularly" : "on_request",
      numPeriods: weeks > 0 ? Math.min(52, Math.round(weeks)) : 4, periodUnit: "week",
      firstDueOn: parseDate(get(r, "nextDue")) ?? (weeks > 0 ? today : null),
    };
    try {
      const { jobSpec } = await createCustomerWithJob(accountId, userId, customer, job, today);
      if (newRoundName && jobSpec.roundId) rounds.set(newRoundName.toLowerCase(), jobSpec.roundId);
      result.imported++;
    } catch (e) {
      result.skipped.push({ row: i + 2, reason: e instanceof Error ? e.message : "Invalid row" });
    }
  }
  return result;
}

export async function exportCustomersCsv(accountId: string): Promise<string> {
  const rows = await listCustomers(accountId);
  const out: (string | number | null)[][] = [["Name", "Company", "Address", "Postcode", "Phone", "Email", "Reference", "Round", "Price", "Frequency (weeks)", "Next due", "Payment method", "Balance"]];
  for (const { customer, contact, specs } of rows) {
    const s = specs[0]?.spec;
    const weeks = s && s.regularity === "regularly" ? (s.periodUnit === "week" ? s.numPeriods : s.periodUnit === "month" ? Math.round(s.numPeriods * 4.33) : s.periodUnit === "day" ? Math.round(s.numPeriods / 7) : s.numPeriods * 52) : "";
    out.push([contactName(contact), contact.company, contact.address, contact.postcode, contact.phone1, contact.email, customer.reference,
      specs[0]?.round?.name ?? "", s ? (s.price / 100).toFixed(2) : "", weeks, s?.nextDueOn ?? "", customer.paymentMethod, (customer.balance / 100).toFixed(2)]);
  }
  return toCsv(out);
}
