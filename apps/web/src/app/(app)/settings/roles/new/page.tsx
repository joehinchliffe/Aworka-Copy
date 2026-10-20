import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createRoleAction } from "../../actions";
import { RoleEditor } from "../RoleEditor";

export default async function NewRolePage() {
  await requireUser("administrator");
  return (
    <>
      <h1>New role</h1>
      <div className="panel">
        <RoleEditor action={createRoleAction} />
        <p><Link href="/settings/roles">Cancel</Link></p>
      </div>
    </>
  );
}
