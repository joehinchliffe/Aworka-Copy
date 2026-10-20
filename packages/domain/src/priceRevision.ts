import { type Pence, roundToStep } from "./money";

export interface PriceRevisionRule {
  kind: "percentage" | "fixed";
  /** Fraction for percentage (0.03 = 3%, may be negative); pence for fixed. */
  amount: number;
  /** Round the new price to the nearest step, e.g. 50 = 50p. */
  roundTo: Pence;
  /** Keep the old price unless it changes by at least this much. */
  minimumChange: Pence;
}

/**
 * New price for one job, or the unchanged price when the change is below the
 * minimum. Jobs linked to a Task are not revised here; they follow the task price.
 */
export function revisePrice(current: Pence, rule: PriceRevisionRule): Pence {
  const raw = rule.kind === "percentage" ? current * (1 + rule.amount) : current + rule.amount;
  const rounded = Math.max(0, roundToStep(Math.round(raw), rule.roundTo));
  return Math.abs(rounded - current) >= rule.minimumChange ? rounded : current;
}
