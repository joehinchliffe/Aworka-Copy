import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getEvent } from "@/lib/services/calendar";
import { EventForm } from "@/components/EventForm";
import { deleteEventAction, saveEventAction } from "../actions";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser("create_events");
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const e = await getEvent(user.accountId, id);
  if (!e) notFound();
  return (
    <>
      <div className="spread">
        <h1>{e.type === "event" ? "Edit event" : "Edit to do"}</h1>
        <Link className="btn" href="/events">Back</Link>
      </div>
      <section className="panel" style={{ maxWidth: 640 }}>
        <EventForm action={saveEventAction.bind(null, e.id)} d={e} />
        <form action={deleteEventAction.bind(null, e.id)} style={{ marginTop: 12 }}>
          <button className="btn small danger">Delete</button>
        </form>
      </section>
    </>
  );
}
