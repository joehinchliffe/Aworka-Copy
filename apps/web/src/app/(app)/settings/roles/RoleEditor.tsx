import { RolePresets } from "@rounds/domain";
import { ActionForm } from "@/components/ActionForm";
import { PERMISSION_GROUPS } from "@/lib/services/users";
import type { FormState } from "@/lib/services/access";
import { PermissionChecklist } from "./PermissionChecklist";

const PRESETS = [
  { label: "New role", permissions: [...RolePresets.newRole] },
  { label: "Franchisee", permissions: [...RolePresets.franchisee] },
  { label: "Employee", permissions: [...RolePresets.employee] },
];

export function RoleEditor({ action, name, permissions }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  name?: string;
  permissions?: string[];
}) {
  return (
    <ActionForm action={action}>
      <label>Role name</label><input name="name" defaultValue={name ?? ""} required style={{ maxWidth: 360 }} />
      <h2>Permissions</h2>
      <PermissionChecklist groups={PERMISSION_GROUPS} initial={permissions ?? PRESETS[0]!.permissions} presets={PRESETS} />
    </ActionForm>
  );
}
