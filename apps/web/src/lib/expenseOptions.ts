/** Expense option lists shared by the service and client components (no database imports). */

/** VAT treatment of an expense. */
export const ExpenseVatStatuses = ["inc_at_rate", "inc_charged", "zero_rate", "exempt", "out_of_scope"] as const;
export type ExpenseVatStatus = (typeof ExpenseVatStatuses)[number];
export const EXPENSE_VAT_LABELS: Record<ExpenseVatStatus, string> = {
  inc_at_rate: "Includes VAT at rate", inc_charged: "Includes VAT charged", zero_rate: "Zero rated",
  exempt: "Exempt", out_of_scope: "Out of scope",
};

/** How an expense was paid. */
export const ExpenseMethods = [
  "cash", "debit_card", "credit_card", "cheque", "direct_debit",
  "standing_order", "bank_transfer", "paypal", "online", "other",
] as const;
export type ExpenseMethod = (typeof ExpenseMethods)[number];
export const EXPENSE_METHOD_LABELS: Record<ExpenseMethod, string> = {
  cash: "Cash", debit_card: "Debit card", credit_card: "Credit card", cheque: "Cheque", direct_debit: "Direct debit",
  standing_order: "Standing order", bank_transfer: "Bank transfer", paypal: "PayPal", online: "Online", other: "Other",
};

/** How much of an expense counts for income tax. */
export const TaxTreatments = ["all_business", "private_use", "custom"] as const;
export type TaxTreatment = (typeof TaxTreatments)[number];

export const PeriodUnitsE = ["day", "week", "month", "year"] as const;
export type ExpensePeriodUnit = (typeof PeriodUnitsE)[number];

export const RecurringSchedules = ["forever", "count", "until_date", "until_total"] as const;
export type RecurringSchedule = (typeof RecurringSchedules)[number];

export const PERIOD_UNIT_LABELS: Record<ExpensePeriodUnit, string> = { day: "days", week: "weeks", month: "months", year: "years" };
export const SCHEDULE_LABELS: Record<RecurringSchedule, string> = {
  forever: "Continue forever", count: "For a number of payments", until_date: "Until a date", until_total: "Until a total is reached",
};
