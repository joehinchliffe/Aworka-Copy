import { addressProviderFromEnv, addressRateLimiter, type AddressProvider } from "@/lib/services/address";
import { getUser } from "@/lib/session";

/** Common checks for the address routes: logged in, rate limited, provider configured. */
export async function withAddressProvider(fn: (p: AddressProvider) => Promise<Response>): Promise<Response> {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!addressRateLimiter.take(user.id)) {
    return Response.json({ error: "Too many lookups, please wait a moment" }, {
      status: 429, headers: { "retry-after": String(addressRateLimiter.retryAfterSeconds(user.id)) },
    });
  }
  const provider = addressProviderFromEnv();
  if (!provider) return Response.json({ enabled: false, results: [] });
  try {
    return await fn(provider);
  } catch {
    return Response.json({ error: "Address lookup is unavailable right now" }, { status: 502 });
  }
}
