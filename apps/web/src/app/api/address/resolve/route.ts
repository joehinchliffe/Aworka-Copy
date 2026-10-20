import { withAddressProvider } from "../lookup";

export const dynamic = "force-dynamic";

/** GET /api/address/resolve?id=  ->  { address, postcode, lat?, lng?, partial? } */
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().slice(0, 40);
  return withAddressProvider(async (p) => {
    const r = id ? await p.resolve(id) : null;
    return r ? Response.json(r) : Response.json({ error: "Address not found" }, { status: 404 });
  });
}
