import { NextResponse, type NextRequest } from "next/server";

/** Expose the request path to server components (used to allow the billing page when a plan has lapsed). */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|favicon).*)"] };
