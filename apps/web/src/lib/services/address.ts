import { extractPostcode } from "./geocoding";

/**
 * UK address lookup. Ideal Postcodes gives premises-level addresses with
 * coordinates (env IDEAL_POSTCODES_KEY); without a key, postcodes.io turns a
 * postcode into its town and area only. ADDRESS_LOOKUP=off disables lookup.
 */
export interface AddressSuggestion { id: string; label: string }
export interface ResolvedAddress {
  /** Multi-line address without the postcode. */
  address: string;
  postcode: string;
  lat?: number;
  lng?: number;
  /** True when only the area is known (no house or street). */
  partial?: boolean;
}
export interface AddressProvider {
  readonly name: string;
  autocomplete(query: string): Promise<AddressSuggestion[]>;
  resolve(id: string): Promise<ResolvedAddress | null>;
}

type Fetch = typeof fetch;
type Env = Record<string, string | undefined>;

async function getJson(fetcher: Fetch, url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetcher(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* empty */ }
  return { status: res.status, body };
}

interface IdealHit { suggestion?: string; udprn?: number | string; urls?: { udprn?: string } }
interface IdealAddress {
  line_1?: string; line_2?: string; line_3?: string; post_town?: string; county?: string; postcode?: string;
  latitude?: number | string | null; longitude?: number | string | null;
}

/** Address lines for a resolved Ideal Postcodes record (postcode kept separate). */
export function idealAddressLines(a: IdealAddress): string {
  const town = a.post_town ? a.post_town.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()) : "";
  return [a.line_1, a.line_2, a.line_3, town].map((l) => (l ?? "").trim()).filter(Boolean).join("\n");
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);

export function idealPostcodes(apiKey: string, fetcher: Fetch = fetch): AddressProvider {
  const base = "https://api.ideal-postcodes.co.uk/v1";
  const fail = (status: number, body: Record<string, unknown>) =>
    new Error(`Address lookup failed (${status}${typeof body.message === "string" ? `: ${body.message}` : ""})`);
  return {
    name: "ideal_postcodes",
    async autocomplete(query) {
      const q = query.trim();
      if (q.length < 2) return [];
      const { status, body } = await getJson(fetcher, `${base}/autocomplete/addresses?${new URLSearchParams({ api_key: apiKey, query: q })}`);
      if (status !== 200) throw fail(status, body);
      const hits = ((body.result as { hits?: IdealHit[] } | undefined)?.hits ?? []);
      return hits.flatMap((h) => {
        const id = h.udprn != null ? String(h.udprn) : h.urls?.udprn?.split("/").pop();
        return id && h.suggestion ? [{ id, label: h.suggestion }] : [];
      });
    },
    async resolve(id) {
      if (!/^\d+$/.test(id)) return null;
      const { status, body } = await getJson(fetcher, `${base}/udprn/${id}?${new URLSearchParams({ api_key: apiKey })}`);
      if (status === 404) return null;
      if (status !== 200) throw fail(status, body);
      const a = body.result as IdealAddress | undefined;
      if (!a) return null;
      const lat = num(a.latitude), lng = num(a.longitude);
      return { address: idealAddressLines(a), postcode: a.postcode ?? "", ...(lat != null && lng != null ? { lat, lng } : {}) };
    },
  };
}

/** Free fallback: postcode autocomplete and the postcode's area; no premises, no stored coordinates. */
export function postcodesIoAddresses(fetcher: Fetch = fetch): AddressProvider {
  const base = "https://api.postcodes.io/postcodes";
  return {
    name: "postcodes_io",
    async autocomplete(query) {
      const q = query.trim().toUpperCase();
      // Only worth asking when the text looks like the start of a postcode.
      const full = extractPostcode(q);
      if (!full && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/.test(q)) return [];
      const { status, body } = await getJson(fetcher, `${base}/${encodeURIComponent(full ?? q)}/autocomplete?limit=10`);
      if (status !== 200) return [];
      return ((body.result as string[] | null) ?? []).map((pc) => ({ id: pc, label: `${pc} (area only, add the house and street)` }));
    },
    async resolve(id) {
      const pc = extractPostcode(id);
      if (!pc) return null;
      const { status, body } = await getJson(fetcher, `${base}/${encodeURIComponent(pc)}`);
      if (status !== 200) return null;
      const r = body.result as { postcode: string; admin_ward?: string; parish?: string; admin_district?: string; post_town?: string } | undefined;
      if (!r) return null;
      const area = [r.parish && !/unparished/i.test(r.parish) ? r.parish : r.admin_ward, r.admin_district]
        .filter((v, i, all): v is string => !!v && all.indexOf(v) === i);
      return { address: area.join("\n"), postcode: r.postcode, partial: true };
    },
  };
}

export function addressProviderFromEnv(env: Env = process.env, fetcher: Fetch = fetch): AddressProvider | null {
  if (env.ADDRESS_LOOKUP === "off") return null;
  if (env.IDEAL_POSTCODES_KEY) return idealPostcodes(env.IDEAL_POSTCODES_KEY, fetcher);
  return postcodesIoAddresses(fetcher);
}

/** Fixed-window in-memory rate limiter (per process). */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    /** True when the call is allowed. */
    take(key: string, now = Date.now()): boolean {
      let w = hits.get(key);
      if (!w || now - w.start >= windowMs) {
        w = { start: now, count: 0 };
        hits.set(key, w);
        if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      }
      if (w.count >= limit) return false;
      w.count++;
      return true;
    },
    retryAfterSeconds(key: string, now = Date.now()): number {
      const w = hits.get(key);
      return w ? Math.max(1, Math.ceil((w.start + windowMs - now) / 1000)) : 0;
    },
  };
}

/** Shared by the address lookup routes: 60 requests a minute per user. */
export const addressRateLimiter = createRateLimiter(60, 60_000);
