import { notFound } from "next/navigation";
import { EditCustomerForm } from "@/components/CustomerForm";
import { getCustomer } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";
import { updateCustomerAction } from "../../actions";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("edit_job_details");
  const c = await getCustomer(user.accountId, id);
  if (!c) notFound();
  return (
    <>
      <h1>Edit customer</h1>
      <EditCustomerForm action={updateCustomerAction.bind(null, id)} d={{ ...c.customer, contact: c.contact }} />
    </>
  );
}
