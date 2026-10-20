/** Role permissions, grouped as in the original product's role editor. */
export const Permissions = [
  // Access
  "administrator", "debt_collection_only", "access_via_web", "access_via_mobile",
  // Jobs & customers
  "create_jobs", "edit_job_details", "delete_jobs", "suspend_jobs",
  "show_account_customer_prices", "export_jobs",
  // Planner
  "add_jobs", "edit_jobs", "move_jobs", "remove_jobs", "adjust_prices",
  // Accounts & admin
  "enter_payments", "access_debt_list", "write_off_debts", "send_invoices",
  "send_estimates", "view_reports", "export_reports", "record_expenses", "edit_settings",
  // Other tasks
  "book_time_off", "create_events", "send_messages", "edit_sales_sources",
] as const;
export type Permission = (typeof Permissions)[number];
export type PermissionSet = ReadonlySet<Permission>;

const all = (except: Permission[] = []): PermissionSet =>
  new Set(Permissions.filter((p) => !except.includes(p)));

export const RolePresets = {
  owner: all(["debt_collection_only"]),
  newRole: all(["debt_collection_only"]),
  franchisee: all(["administrator", "debt_collection_only", "export_jobs", "edit_sales_sources"]),
  employee: new Set<Permission>([
    "access_via_web", "access_via_mobile", "add_jobs", "edit_jobs", "move_jobs",
    "remove_jobs", "adjust_prices", "enter_payments", "access_debt_list",
    "record_expenses", "book_time_off",
  ]),
} satisfies Record<string, PermissionSet>;

export function can(set: PermissionSet, p: Permission): boolean {
  return set.has("administrator") || set.has(p);
}
