/** How a customer normally pays. */
export const CustomerPaymentMethods = [
  "on_day", "card", "collection", "by_post", "online",
  "direct_to_bank", "email_invoice", "paper_invoice", "direct_debit",
] as const;
export type CustomerPaymentMethod = (typeof CustomerPaymentMethods)[number];

export const paysOnDay = (m: CustomerPaymentMethod) =>
  m === "on_day" || m === "card" || m === "collection";
export const isInvoiced = (m: CustomerPaymentMethod) =>
  m === "email_invoice" || m === "paper_invoice";

/** When invoices (or direct-debit collections) are raised. */
export const InvoiceFrequencies = [
  "manually", "after_each_job", "overnight", "periodically",
  "when_value_reaches", "when_jobs_done_reaches", "before_each_job",
] as const;
export type InvoiceFrequency = (typeof InvoiceFrequencies)[number];

export const PaymentTermsTypes = [
  "not_required", "by_return", "cod", "net_from_invoice_date", "net_from_month_end",
] as const;
export type PaymentTermsType = (typeof PaymentTermsTypes)[number];

export const JobStatuses = ["to_do", "done", "not_done", "skipped", "estimate"] as const;
export type JobStatus = (typeof JobStatuses)[number];

export const JobSpecStatuses = ["estimate", "active", "suspended", "deleted"] as const;
export type JobSpecStatus = (typeof JobSpecStatuses)[number];

export const Regularities = ["one_off", "on_request", "regularly"] as const;
export type Regularity = (typeof Regularities)[number];

export const PeriodUnits = ["day", "week", "month", "year"] as const;
export type PeriodUnit = (typeof PeriodUnits)[number];

export const AppointmentRules = ["none", "confirm_day_before", "confirm_few_days_before"] as const;
export type AppointmentRule = (typeof AppointmentRules)[number];

/** VAT treatment of a job price. */
export const VatStatuses = ["inc_vat", "ex_vat", "zero_rated", "exempt", "out_of_scope"] as const;
export type VatStatus = (typeof VatStatuses)[number];

export const PaymentMethods = [
  "cash", "cheque", "card", "direct_debit", "standing_order",
  "online", "bank_transfer", "paypal", "recurring_card", "gocardless", "stripe",
] as const;
export type PaymentMethod = (typeof PaymentMethods)[number];

export const AdjustmentTypes = [
  "starting_balance", "credit", "overpayment", "surcharge", "discount", "tip", "bad_debt",
] as const;
export type AdjustmentType = (typeof AdjustmentTypes)[number];

export const PlanNextModes = [
  "no", "on_date", "in_periods", "from_last_done", "from_last_due", "not_applicable",
] as const;
export type PlanNextMode = (typeof PlanNextModes)[number];

export const AutoMarkPolicies = ["assume_not_done", "mark_done_overnight", "keep_until_next_due"] as const;
export type AutoMarkPolicy = (typeof AutoMarkPolicies)[number];
