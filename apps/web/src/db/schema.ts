import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const accountId = () => uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" });
const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** A subscribing business (tenant). Settings that are per business live here. */
export const accounts = pgTable("accounts", {
  id: id(),
  businessName: text("business_name").notNull(),
  plan: text("plan").notNull().default("trial"), // trial | simple | smart | team
  trialEndsOn: date("trial_ends_on"),
  locale: text("locale").notNull().default("en-GB"),
  currency: text("currency").notNull().default("GBP"),
  taxName: text("tax_name").notNull().default("VAT"),
  yearEndMonth: integer("year_end_month").notNull().default(4),
  yearEndDay: integer("year_end_day").notNull().default(5),
  collectsVat: boolean("collects_vat").notNull().default(false),
  vatRate: real("vat_rate").notNull().default(0.2),
  profitBasis: text("profit_basis").notNull().default("accrual"), // accrual | cash
  settings: jsonb("settings").$type<AccountSettings>().notNull().default({}),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  nextReceiptNumber: integer("next_receipt_number").notNull().default(1),
  nextEstimateNumber: integer("next_estimate_number").notNull().default(1),
  ...stamps,
});

export interface AccountSettings {
  invoiceTitle?: string;
  invoiceNotes?: string;
  invoiceSmallPrint?: string;
  defaultJobDescription?: string;
  paymentTermsType?: string;
  paymentTermsDays?: number;
  showNextDueOnInvoices?: boolean;
  defaultPaid?: "job_price" | "debt_balance";
  autoMarkPolicy?: "assume_not_done" | "mark_done_overnight" | "keep_until_next_due";
  autoMarkAfterDays?: number;
  replanFrom?: "last_job" | "last_due";
  firstWeekDay?: number;
  daysWorked?: number;
  addJobsOrder?: "next_due" | "round_order";
  defaultTimeRequired?: number;
  emailSignature?: string;
  website?: string;
  address?: string;
  phone?: string;
}

export const roles = pgTable("roles", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
  ...stamps,
});

export const users = pgTable("users", {
  id: id(),
  accountId: accountId(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  isOwner: boolean("is_owner").notNull().default(false),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
  managerId: uuid("manager_id"),
  phone: text("phone"),
  ...stamps,
}, (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: id(),
  accountId: accountId(),
  title: text("title"),
  firstNames: text("first_names"),
  lastName: text("last_name"),
  company: text("company"),
  address: text("address"), // multi-line
  postcode: text("postcode"),
  lat: real("lat"),
  lng: real("lng"),
  latLngSource: text("lat_lng_source"), // geocoded | gps | manual | approx | what3words | failed
  phone1: text("phone1"),
  phone2: text("phone2"),
  phone3: text("phone3"),
  email: text("email"),
  emailCc: text("email_cc"),
  ...stamps,
});

export const customers = pgTable("customers", {
  id: id(),
  accountId: accountId(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  reference: text("reference"),
  contactMethod: text("contact_method").notNull().default("email"), // none | email | sms | both
  acceptsMarketing: boolean("accepts_marketing").notNull().default(true),
  paymentMethod: text("payment_method").notNull().default("on_day"),
  invoiceFrequency: text("invoice_frequency").notNull().default("after_each_job"),
  invoicePeriodNum: integer("invoice_period_num").notNull().default(1),
  invoicePeriodUnit: text("invoice_period_unit").notNull().default("month"),
  invoiceJobsThreshold: integer("invoice_jobs_threshold").notNull().default(2),
  invoiceValueThreshold: integer("invoice_value_threshold"),
  directDebitAmount: integer("direct_debit_amount"),
  nextInvoiceOn: date("next_invoice_on"),
  paymentTermsType: text("payment_terms_type"), // null = from settings
  paymentTermsDays: integer("payment_terms_days"),
  notes: text("notes"),
  startingBalance: integer("starting_balance").notNull().default(0),
  startingBalanceOn: date("starting_balance_on"),
  /** Cached: negative = owes. Recomputed from ledger by services. */
  balance: integer("balance").notNull().default(0),
  debtSince: date("debt_since"),
  anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...stamps,
}, (t) => [index("customers_account_idx").on(t.accountId)]);

export const rounds = pgTable("rounds", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  otherIncome: boolean("other_income").notNull().default(false),
  ...stamps,
});

export const tasks = pgTable("tasks", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  description: text("description"),
  timeRequired: integer("time_required"),
  price: integer("price"),
  ...stamps,
});

export const salesSources = pgTable("sales_sources", {
  id: id(),
  accountId: accountId(),
  type: text("type").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  ...stamps,
});

/** A recurring (or one-off) job definition for a customer. */
export const jobSpecs = pgTable("job_specs", {
  id: id(),
  accountId: accountId(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  jobContactId: uuid("job_contact_id").references(() => contacts.id),
  location: text("location").notNull().default("customer"), // customer | other | none
  roundId: uuid("round_id").references(() => rounds.id, { onDelete: "set null" }),
  roundIndex: integer("round_index").notNull().default(0),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  salesSourceId: uuid("sales_source_id").references(() => salesSources.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"), // estimate | active | suspended | deleted
  reference: text("reference"),
  description: text("description"),
  notes: text("notes"),
  price: integer("price").notNull().default(0),
  vatStatus: text("vat_status").notNull().default("inc_vat"),
  timeRequired: integer("time_required").notNull().default(30),
  regularity: text("regularity").notNull().default("regularly"),
  timesPerPeriod: integer("times_per_period").notNull().default(1),
  numPeriods: integer("num_periods").notNull().default(4),
  periodUnit: text("period_unit").notNull().default("week"),
  monthRule: jsonb("month_rule"),
  allowedDays: integer("allowed_days").notNull().default(127),
  appointments: text("appointments").notNull().default("none"),
  nextDueOn: date("next_due_on"),
  lastDoneOn: date("last_done_on"),
  priceChangedOn: date("price_changed_on"),
  ...stamps,
}, (t) => [index("job_specs_account_idx").on(t.accountId), index("job_specs_customer_idx").on(t.customerId)]);

export const invoices = pgTable("invoices", {
  id: id(),
  accountId: accountId(),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  number: text("number").notNull(),
  kind: text("kind").notNull().default("invoice"), // invoice | estimate | receipt | statement
  issuedOn: date("issued_on").notNull(),
  dueOn: date("due_on"),
  net: integer("net").notNull().default(0),
  vat: integer("vat").notNull().default(0),
  gross: integer("gross").notNull().default(0),
  amountToPay: integer("amount_to_pay").notNull().default(0),
  notes: text("notes"),
  lines: jsonb("lines").$type<InvoiceLine[]>().notNull().default([]),
  viewToken: text("view_token").notNull(),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...stamps,
}, (t) => [index("invoices_account_idx").on(t.accountId)]);

export interface InvoiceLine {
  jobId?: string;
  date: string;
  description: string;
  net: number;
  vat: number;
  gross: number;
}

/** A planned or completed visit. */
export const jobs = pgTable("jobs", {
  id: id(),
  accountId: accountId(),
  jobSpecId: uuid("job_spec_id").notNull().references(() => jobSpecs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  dueOn: date("due_on"),
  status: text("status").notNull().default("to_do"), // to_do | done | not_done | skipped | estimate
  apptType: text("appt_type").notNull().default("manual"), // estimate | first | auto | manual
  confirmed: boolean("confirmed"),
  price: integer("price").notNull().default(0),
  previousPrice: integer("previous_price"),
  vatStatus: text("vat_status").notNull().default("inc_vat"),
  vatRate: real("vat_rate").notNull().default(0),
  timeRequired: integer("time_required").notNull().default(30),
  notes: text("notes"),
  dayOrder: integer("day_order"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  ...stamps,
}, (t) => [
  index("jobs_account_date_idx").on(t.accountId, t.date),
  uniqueIndex("jobs_spec_date_unique").on(t.jobSpecId, t.date),
]);

export const payments = pgTable("payments", {
  id: id(),
  accountId: accountId(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  paid: integer("paid").notNull().default(0),
  tip: integer("tip").notNull().default(0),
  method: text("method").notNull().default("cash"),
  reference: text("reference"),
  status: text("status").notNull().default("cleared"), // pending | cleared | failed
  banked: boolean("banked").notNull().default(false),
  receiptNumber: text("receipt_number"),
  ...stamps,
}, (t) => [index("payments_customer_idx").on(t.customerId)]);

/** Non-payment balance changes: starting balance, credit, surcharge, discount, bad debt... */
export const adjustments = pgTable("adjustments", {
  id: id(),
  accountId: accountId(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(), // positive increases the customer's balance (in their favour)
  notes: text("notes"),
  ...stamps,
});

export const expenseCategories = pgTable("expense_categories", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  capitalAsset: boolean("capital_asset").notNull().default(false),
  ...stamps,
});

export const expenseSuppliers = pgTable("expense_suppliers", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  ...stamps,
});

export const recurringExpenses = pgTable("recurring_expenses", {
  id: id(),
  accountId: accountId(),
  categoryId: uuid("category_id").notNull().references(() => expenseCategories.id),
  supplierId: uuid("supplier_id").references(() => expenseSuppliers.id),
  description: text("description"),
  amount: integer("amount"),
  vatStatus: text("vat_status").notNull().default("inc_at_rate"),
  vatRate: real("vat_rate").notNull().default(0.2),
  method: text("method"),
  everyNum: integer("every_num").notNull().default(1),
  everyUnit: text("every_unit").notNull().default("month"),
  nextDueOn: date("next_due_on").notNull(),
  schedule: text("schedule").notNull().default("forever"), // forever | count | until_date | until_total
  endOn: date("end_on"),
  remainingCount: integer("remaining_count"),
  totalLimit: integer("total_limit"),
  totalSoFar: integer("total_so_far").notNull().default(0),
  ...stamps,
});

export const expenses = pgTable("expenses", {
  id: id(),
  accountId: accountId(),
  date: date("date").notNull(),
  categoryId: uuid("category_id").notNull().references(() => expenseCategories.id),
  supplierId: uuid("supplier_id").references(() => expenseSuppliers.id),
  recurringExpenseId: uuid("recurring_expense_id").references(() => recurringExpenses.id, { onDelete: "set null" }),
  reference: text("reference"),
  description: text("description"),
  amount: integer("amount"),
  vatStatus: text("vat_status").notNull().default("inc_at_rate"),
  vatRate: real("vat_rate").notNull().default(0.2),
  vatCharged: integer("vat_charged"),
  method: text("method"),
  paymentReference: text("payment_reference"),
  privateUsePercent: real("private_use_percent"),
  reclaimableVat: integer("reclaimable_vat"),
  allowable: integer("allowable"),
  taxNotes: text("tax_notes"),
  ...stamps,
}, (t) => [index("expenses_account_date_idx").on(t.accountId, t.date)]);

export const vehicles = pgTable("vehicles", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  registration: text("registration"),
  acquiredOn: date("acquired_on"),
  startMileage: integer("start_mileage").notNull().default(0),
  ratePerMile: integer("rate_per_mile").notNull().default(45), // pence
  notes: text("notes"),
  ...stamps,
});

export const mileages = pgTable("mileages", {
  id: id(),
  accountId: accountId(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  start: integer("start").notNull(),
  finish: integer("finish"),
  notes: text("notes"),
  ...stamps,
});

export const events = pgTable("events", {
  id: id(),
  accountId: accountId(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull().default("event"), // event | to_do | done_to_do
  date: date("date").notNull(),
  time: text("time"),
  summary: text("summary").notNull(),
  details: text("details"),
  linkedType: text("linked_type"),
  linkedId: uuid("linked_id"),
  ...stamps,
});

export const holidays = pgTable("holidays", {
  id: id(),
  accountId: accountId(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  startOn: date("start_on").notNull(),
  endOn: date("end_on").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  ...stamps,
});

export const dayNotes = pgTable("day_notes", {
  id: id(),
  accountId: accountId(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  topNotes: text("top_notes"),
  bottomNotes: text("bottom_notes"),
  ...stamps,
});

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  accountId: accountId(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default("general"),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  smsBody: text("sms_body"),
  ...stamps,
});

export const messages = pgTable("messages", {
  id: id(),
  accountId: accountId(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  channel: text("channel").notNull(), // email | sms
  reason: text("reason").notNull().default("other"),
  status: text("status").notNull().default("queued"), // draft | queued | sent | failed
  to: text("to").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  ...stamps,
});

export const priceRevisions = pgTable("price_revisions", {
  id: id(),
  accountId: accountId(),
  description: text("description").notNull(),
  rule: jsonb("rule").notNull(),
  changes: jsonb("changes").$type<{ jobSpecId: string; from: number; to: number }[]>().notNull().default([]),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
  ...stamps,
});

/** Append-only activity log for the Activity report and audit trail. */
export const activities = pgTable("activities", {
  id: id(),
  accountId: accountId(),
  userId: uuid("user_id"),
  customerId: uuid("customer_id"),
  date: date("date").notNull(),
  category: text("category").notNull(), // jobs | estimates | payments | adjustments | invoices | receipts | job_value_changes
  subcategory: text("subcategory"),
  summary: text("summary").notNull(),
  amount: integer("amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activities_account_date_idx").on(t.accountId, t.date)]);
