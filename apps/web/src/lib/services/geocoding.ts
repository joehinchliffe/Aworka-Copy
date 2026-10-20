import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

export interface GeoResult { lat: number; lng: number; source: "approx" | "geocoded" }
export interface Geocoder { geocode(address: string, postcode: string | null): Promise<GeoResult | null> }

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export function extractPostcode(text: string | null | undefined): string | null {
  const m = text?.match(UK_POSTCODE);
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : null;
}

/** Free postcode-centroid geocoding (UK). Accurate to a street or two, marked "approx". */
export const postcodesIo: Geocoder = {
  async geocode(_address, postcode) {
    if (!postcode) return null;
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, { signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as { status: number; result?: { latitude: number; longitude: number }; terminated?: { latitude: number; longitude: number } };
    const r = body.result ?? body.terminated;
    return r ? { lat: r.latitude, lng: r.longitude, source: "approx" } : null;
  },
};

/** Mapbox permanent geocoding (results may be stored). Requires MAPBOX_TOKEN. */
export const mapbox = (token: string): Geocoder => ({
  async geocode(address, postcode) {
    const q = [address.replace(/\n/g, ", "), postcode].filter(Boolean).join(", ");
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=gb&limit=1&permanent=true&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
    const f = body.features?.[0];
    return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], source: "geocoded" } : null;
  },
});

export function defaultGeocoder(): Geocoder | null {
  if (process.env.GEOCODER === "off") return null;
  if (process.env.MAPBOX_TOKEN) return mapbox(process.env.MAPBOX_TOKEN);
  return postcodesIo;
}

/** Geocode a contact if it has no coordinates yet. Failures are recorded, never thrown. */
export async function geocodeContact(contactId: string, geocoder = defaultGeocoder()) {
  if (!geocoder) return;
  const c = await db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) });
  if (!c || c.lat != null || !c.address) return;
  const postcode = c.postcode || extractPostcode(c.address);
  try {
    const r = await geocoder.geocode(c.address, postcode);
    await db.update(schema.contacts).set(r ? { lat: r.lat, lng: r.lng, latLngSource: r.source } : { latLngSource: "failed" })
      .where(eq(schema.contacts.id, contactId));
  } catch {
    /* network problems: leave for the next attempt */
  }
}

/** Geocode any contacts still missing coordinates (nightly step). */
export async function geocodePending(accountId: string) {
  const pending = await db.select({ id: schema.contacts.id }).from(schema.contacts)
    .where(and(eq(schema.contacts.accountId, accountId), isNull(schema.contacts.lat), isNotNull(schema.contacts.address), isNull(schema.contacts.latLngSource)))
    .limit(200);
  for (const p of pending) await geocodeContact(p.id);
  return pending.length;
}

export async function setContactLocation(accountId: string, contactId: string, lat: number, lng: number) {
  await db.update(schema.contacts).set({ lat, lng, latLngSource: "manual" })
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.accountId, accountId)));
}
