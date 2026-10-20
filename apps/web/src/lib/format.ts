import { formatPence } from "@rounds/domain";

export const money = (p: number | null | undefined) => (p == null ? "" : formatPence(p));
/** Balance shown from the customer's side: owes £x / £x credit. */
export function balanceLabel(b: number) {
  if (b < 0) return { text: `${formatPence(-b)} owed`, cls: "debt" };
  if (b > 0) return { text: `${formatPence(b)} credit`, cls: "credit" };
  return { text: "£0.00", cls: "muted" };
}
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  on_day: "On day", card: "Card", collection: "Collection", by_post: "By post", online: "Online",
  direct_to_bank: "Direct to bank", email_invoice: "Email invoice", paper_invoice: "Paper invoice", direct_debit: "Direct debit",
};
export const PAY_METHODS: Record<string, string> = {
  cash: "Cash", cheque: "Cheque", card: "Card", direct_debit: "Direct debit", standing_order: "Standing order",
  online: "Online", bank_transfer: "Bank transfer", paypal: "PayPal", recurring_card: "Recurring card", gocardless: "GoCardless", stripe: "Stripe",
};
export const INVOICE_FREQ_LABELS: Record<string, string> = {
  manually: "Manually", after_each_job: "After each job", overnight: "Overnight", periodically: "Periodically",
  when_value_reaches: "When value reaches", when_jobs_done_reaches: "When jobs done reaches", before_each_job: "Before each job",
};
export function frequencyLabel(s: { regularity: string; timesPerPeriod: number; numPeriods: number; periodUnit: string }) {
  if (s.regularity === "one_off") return "One off";
  if (s.regularity === "on_request") return "On request";
  const times = s.timesPerPeriod === 1 ? "" : s.timesPerPeriod === 2 ? "Twice " : `${s.timesPerPeriod} times `;
  const unit = s.numPeriods === 1 ? s.periodUnit : `${s.numPeriods} ${s.periodUnit}s`;
  if (!times && s.numPeriods === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[s.periodUnit] ?? unit;
  return `${times}every ${unit}`;
}
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
