import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { requireUser } from "@/lib/session";
import { listRoles, listUsers } from "@/lib/services/users";
import { createUserAction } from "../../actions";
import { UserFields } from "../UserFields";

export default async function NewUserPage() {
  const user = await requireUser("administrator");
  const [roles, users] = await Promise.all([listRoles(user.accountId), listUsers(user.accountId)]);
  return (
    <>
      <h1>New user</h1>
      <div className="panel narrow">
        <p className="small muted">Each extra user is added to your subscription.</p>
        <ActionForm action={createUserAction} submitLabel="Add user">
          <UserFields isNew roles={roles.map((r) => r.role)} managers={users.map((u) => u.user)} d={{ managerId: user.id }} />
        </ActionForm>
        <p><Link href="/settings/users">Cancel</Link></p>
      </div>
    </>
  );
}
