import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { JobMap, type MapPoint } from "@/components/JobMap";
import { requireUser } from "@/lib/session";
import { contactName, firstAddressLine } from "@/lib/services/ledger";

export default async function MapPage() {
  const user = await requireUser();
  const rows = await db.select({ spec: schema.jobSpecs, contact: schema.contacts, round: schema.rounds, customerContactId: schema.customers.contactId })
    .from(schema.jobSpecs)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.jobSpecs.customerId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.jobSpecs.jobContactId))
    .leftJoin(schema.rounds, eq(schema.rounds.id, schema.jobSpecs.roundId))
    .where(and(eq(schema.jobSpecs.accountId, user.accountId), ne(schema.jobSpecs.status, "deleted"), isNotNull(schema.contacts.lat)));
  const points: MapPoint[] = rows.map(({ spec, contact, round }) => ({
    id: spec.id, lat: contact.lat!, lng: contact.lng!, label: `${firstAddressLine(contact)} · ${contactName(contact)}`,
    href: `/customers/${spec.customerId}`, round: round?.name ?? null, approx: contact.latLngSource === "approx",
  }));
  return (
    <>
      <h1>Job map</h1>
      <p className="small muted">{points.length} located jobs. Faint markers are placed by postcode only. Colours show rounds.</p>
      <JobMap points={points} tileUrl={process.env.MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} />
    </>
  );
}
