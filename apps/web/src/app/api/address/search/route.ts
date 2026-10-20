import { withAddressProvider } from "../lookup";

export const dynamic = "force-dynamic";

/** GET /api/address/search?q=  ->  { enabled, provider, results: [{ id, label }] } */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  return withAddressProvider(async (p) => {
    const results = q.length >= 2 ? await p.autocomplete(q) : [];
    return Response.json({ enabled: true, provider: p.name, results: results.slice(0, 10) });
  });
}
