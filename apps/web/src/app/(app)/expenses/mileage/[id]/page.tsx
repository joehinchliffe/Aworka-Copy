import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getMileage, listVehicles } from "@/lib/services/expenses";
import { deleteTripAction, saveTripAction } from "../../actions";
import { ConfirmButton, TripForm } from "../../forms";

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("record_expenses");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [trip, vehicles] = await Promise.all([
    getMileage(user.accountId, id),
    listVehicles(user.accountId),
  ]);
  if (!trip) notFound();
  return (
    <>
      <div className="spread">
        <h1>Edit trip</h1>
        <ConfirmButton action={deleteTripAction.bind(null, id)} label="Delete" question="Delete this trip?" />
      </div>
      <div className="panel" style={{ maxWidth: 760 }}>
        <TripForm action={saveTripAction.bind(null, id)} d={trip} vehicles={vehicles} submitLabel="Save" />
      </div>
    </>
  );
}
