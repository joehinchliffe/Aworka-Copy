import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { Permissions, type Permission } from "@rounds/domain";
import { db, schema } from "@/db";
import { hashPassword } from "@/lib/auth";
import { assertCan, type Actor } from "./access";

const optStr = z.string().trim().optional().transform((s) => (s ? s : null));
const optUuid = z.string().uuid().optional().nullable().or(z.literal("")).transform((s) => (s ? s : null));

/** The role editor's five groups, in the order the product shows them. */
export const PERMISSION_GROUPS: { title: string; items: { key: Permission; label: string }[] }[] = [
  { title: "Access", items: [
    { key: "administrator", label: "Administrator" }, { key: "debt_collection_only", label: "Debt collection only" },
    { key: "access_via_web", label: "Access via web" }, { key: "access_via_mobile", label: "Access via mobile" },
  ] },
  { title: "Jobs & customers", items: [
    { key: "create_jobs", label: "Create customers and jobs" }, { key: "edit_job_details", label: "Edit customers and jobs" },
    { key: "delete_jobs", label: "Delete jobs" }, { key: "suspend_jobs", label: "Suspend jobs" },
    { key: "show_account_customer_prices", label: "Show account customer prices" }, { key: "export_jobs", label: "Export jobs" },
  ] },
  { title: "Planner", items: [
    { key: "add_jobs", label: "Add jobs" }, { key: "edit_jobs", label: "Edit jobs" }, { key: "move_jobs", label: "Move jobs" },
    { key: "remove_jobs", label: "Remove jobs" }, { key: "adjust_prices", label: "Adjust prices" },
  ] },
  { title: "Accounts & admin", items: [
    { key: "enter_payments", label: "Enter payments" }, { key: "access_debt_list", label: "Access debt list" },
    { key: "write_off_debts", label: "Write off debts" }, { key: "send_invoices", label: "Send invoices" },
    { key: "send_estimates", label: "Send estimates" }, { key: "view_reports", label: "View reports" },
    { key: "export_reports", label: "Export reports" }, { key: "record_expenses", label: "Record expenses" },
    { key: "edit_settings", label: "Edit settings" },
  ] },
  { title: "Other tasks", items: [
    { key: "book_time_off", label: "Book time off" }, { key: "create_events", label: "Create events" },
    { key: "send_messages", label: "Send messages" }, { key: "edit_sales_sources", label: "Edit sales sources" },
  ] },
];

// ---------- Users ----------

export async function listUsers(accountId: string) {
  return db.select({ user: schema.users, role: schema.roles }).from(schema.users)
    .leftJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(eq(schema.users.accountId, accountId))
    .orderBy(sql`${schema.users.isOwner} desc`, asc(schema.users.name));
}

export async function getUserRow(accountId: string, userId: string) {
  return db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.accountId, accountId)) });
}

const userBase = {
  email: z.string().trim().email("Enter a valid email address"),
  name: z.string().trim().min(1, "Enter the user's name"),
  phone: optStr,
  roleId: optUuid,
  managerId: optUuid,
};
export const newUserInput = z.object({ ...userBase, password: z.string().min(8, "Password must be at least 8 characters"), passwordConfirmation: z.string().optional() })
  .refine((u) => u.passwordConfirmation === undefined || u.password === u.passwordConfirmation, { message: "Passwords do not match", path: ["passwordConfirmation"] });
export const editUserInput = z.object({ ...userBase, password: z.string().optional().transform((s) => (s ? s : undefined)) });

async function checkRefs(accountId: string, roleId: string | null, managerId: string | null, selfId?: string) {
  if (roleId && !(await db.query.roles.findFirst({ where: and(eq(schema.roles.id, roleId), eq(schema.roles.accountId, accountId)) }))) throw new Error("Role not found");
  if (managerId) {
    if (managerId === selfId) throw new Error("A user cannot manage themselves");
    if (!(await getUserRow(accountId, managerId))) throw new Error("Manager not found");
  }
}

async function checkEmailFree(email: string, exceptId?: string) {
  const existing = await db.query.users.findFirst({
    where: and(sql`lower(${schema.users.email}) = lower(${email})`, exceptId ? ne(schema.users.id, exceptId) : undefined),
  });
  if (existing) throw new Error("A user with that email already exists");
}

export async function createUser(actor: Actor, raw: z.input<typeof newUserInput>) {
  assertCan(actor, "administrator");
  const u = newUserInput.parse(raw);
  await checkEmailFree(u.email);
  await checkRefs(actor.accountId, u.roleId, u.managerId);
  const [row] = await db.insert(schema.users).values({
    accountId: actor.accountId, email: u.email, name: u.name, phone: u.phone, roleId: u.roleId, managerId: u.managerId,
    passwordHash: await hashPassword(u.password),
  }).returning();
  return row!;
}

export async function updateUser(actor: Actor, userId: string, raw: z.input<typeof editUserInput>) {
  assertCan(actor, "administrator");
  const u = editUserInput.parse(raw);
  const existing = await getUserRow(actor.accountId, userId);
  if (!existing) throw new Error("User not found");
  await checkEmailFree(u.email, userId);
  await checkRefs(actor.accountId, u.roleId, u.managerId, userId);
  if (u.password !== undefined && u.password.length < 8) throw new Error("Password must be at least 8 characters");
  await db.update(schema.users).set({
    email: u.email, name: u.name, phone: u.phone, managerId: u.managerId,
    // The owner always has every permission; their role is not used.
    roleId: existing.isOwner ? existing.roleId : u.roleId,
    ...(u.password ? { passwordHash: await hashPassword(u.password) } : {}),
    updatedAt: new Date(),
  }).where(eq(schema.users.id, userId));
}

export async function removeUser(actor: Actor, userId: string) {
  assertCan(actor, "administrator");
  const existing = await getUserRow(actor.accountId, userId);
  if (!existing) throw new Error("User not found");
  if (existing.isOwner) throw new Error("The account owner cannot be removed");
  if (existing.id === actor.id) throw new Error("You cannot remove yourself");
  await db.transaction(async (tx) => {
    await tx.update(schema.users).set({ managerId: null }).where(and(eq(schema.users.accountId, actor.accountId), eq(schema.users.managerId, userId)));
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
}

// ---------- Roles ----------

export async function listRoles(accountId: string) {
  const rows = await db.select({
    role: schema.roles,
    users: sql<number>`(select count(*)::int from users u where u.role_id = ${schema.roles.id})`,
  }).from(schema.roles).where(eq(schema.roles.accountId, accountId)).orderBy(asc(schema.roles.name));
  return rows;
}

export async function getRole(accountId: string, roleId: string) {
  return db.query.roles.findFirst({ where: and(eq(schema.roles.id, roleId), eq(schema.roles.accountId, accountId)) });
}

export const roleInput = z.object({
  name: z.string().trim().min(1, "Enter a role name"),
  permissions: z.array(z.string()).transform((ps) => Permissions.filter((p) => ps.includes(p))),
});

export async function createRole(actor: Actor, raw: z.input<typeof roleInput>) {
  assertCan(actor, "administrator");
  const r = roleInput.parse(raw);
  const [row] = await db.insert(schema.roles).values({ accountId: actor.accountId, name: r.name, permissions: [...r.permissions] }).returning();
  return row!;
}

export async function updateRole(actor: Actor, roleId: string, raw: z.input<typeof roleInput>) {
  assertCan(actor, "administrator");
  const r = roleInput.parse(raw);
  const res = await db.update(schema.roles).set({ name: r.name, permissions: [...r.permissions], updatedAt: new Date() })
    .where(and(eq(schema.roles.id, roleId), eq(schema.roles.accountId, actor.accountId))).returning({ id: schema.roles.id });
  if (!res.length) throw new Error("Role not found");
}

export async function deleteRole(actor: Actor, roleId: string) {
  assertCan(actor, "administrator");
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.roleId, roleId));
  if (n > 0) throw new Error("This role is in use; move its users to another role first");
  await db.delete(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.accountId, actor.accountId)));
}

// ---------- Round assignments ----------

/** Assign rounds to users: `assignments` maps roundId to userId (or null for unassigned). */
export async function assignRounds(actor: Actor, assignments: Record<string, string | null>) {
  assertCan(actor, "administrator");
  const users = new Set((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.accountId, actor.accountId))).map((u) => u.id));
  await db.transaction(async (tx) => {
    for (const [roundId, userId] of Object.entries(assignments)) {
      if (userId && !users.has(userId)) throw new Error("User not found");
      await tx.update(schema.rounds).set({ userId: userId || null, updatedAt: new Date() })
        .where(and(eq(schema.rounds.id, roundId), eq(schema.rounds.accountId, actor.accountId)));
    }
  });
}
