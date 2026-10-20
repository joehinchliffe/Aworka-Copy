import type { Pence } from "./money";

/**
 * Customer balance convention: negative = customer owes money, positive = in credit.
 *
 * When a job is completed and a payment taken:
 *   newBalance = balance + paid - price - tip
 * `tip` is the part of `paid` that is a gratuity; a negative tip with zero paid
 * records a bad-debt write-off.
 */
export function balanceAfterJob(balance: Pence, price: Pence, paid: Pence, tip: Pence): Pence {
  return balance + paid - price - tip;
}

export type DefaultPaidMode = "job_price" | "debt_balance";

/** Pre-filled "paid" amount when a job is marked done. */
export function defaultPaid(balanceBeforeJob: Pence, price: Pence, mode: DefaultPaidMode): Pence {
  const owedAfterJob = Math.max(0, price - balanceBeforeJob);
  if (mode === "debt_balance") return owedAfterJob;
  return Math.min(price, owedAfterJob);
}

/** Split a total taken on the day into payment and tip ("inc Tip?"). */
export function splitTip(totalTaken: Pence, price: Pence): { paid: Pence; tip: Pence } {
  const tip = Math.max(0, totalTaken - price);
  return { paid: totalTaken, tip };
}

/** Debt since: keep the earlier date while the customer stays in debt. */
export function nextDebtSince(prevBalance: Pence, newBalance: Pence, prevSince: string | null, today: string): string | null {
  if (newBalance >= 0) return null;
  if (prevBalance < 0 && prevSince) return prevSince;
  return today;
}
