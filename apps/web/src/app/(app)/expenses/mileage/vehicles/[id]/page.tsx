import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getVehicle } from "@/lib/services/expenses";
import { deleteVehicleAction, saveVehicleAction } from "../../../actions";
import { ConfirmButton, VehicleForm } from "../../../forms";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("record_expenses");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await getVehicle(user.accountId, id);
  if (!v) notFound();
  return (
    <>
      <div className="spread">
        <h1>{v.name}</h1>
        <ConfirmButton action={deleteVehicleAction.bind(null, id)} label="Delete" question="Delete this vehicle and all its trips?" />
      </div>
      <div className="panel" style={{ maxWidth: 760 }}>
        <VehicleForm action={saveVehicleAction.bind(null, id)} d={v} submitLabel="Save" />
      </div>
    </>
  );
}
