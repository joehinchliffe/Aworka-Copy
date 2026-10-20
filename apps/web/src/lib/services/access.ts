import { can, type Permission } from "@rounds/domain";

/** The user performing an action. `CurrentUser` from auth.ts satisfies this. */
export interface Actor {
  id: string;
  accountId: string;
  isOwner?: boolean;
  permissions: ReadonlySet<Permission>;
}

export class PermissionError extends Error {
  constructor(public permission: Permission) { super("You do not have permission to do that"); }
}

/** Throw unless the actor's role grants `permission` (administrator implies all). */
export function assertCan(actor: Actor, permission: Permission) {
  if (actor.isOwner) return;
  if (!can(actor.permissions, permission)) throw new PermissionError(permission);
}

/** Shared form-state shape used by the settings-area server actions. */
export type FormState = { errors?: string[]; ok?: string } | undefined;

export function errorsOf(e: unknown): FormState {
  if (e && typeof e === "object" && "errors" in e && Array.isArray((e as { errors: unknown }).errors)) {
    return { errors: (e as { errors: string[] }).errors };
  }
  if (e && typeof e === "object" && "issues" in e) {
    return { errors: (e as { issues: { path: unknown[]; message: string }[] }).issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };
  }
  return { errors: [e instanceof Error ? e.message : "Something went wrong"] };
}
