import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env.client";

// Routes a signed-out visitor may open (FR-AUTH-2). Everything else needs sign-in.
const PUBLIC_PATHS = ["/", "/login"];
const PUBLIC_PREFIXES = ["/auth/"];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

// Refreshes the Supabase session cookie and does an optimistic redirect check.
// Real authorization still happens next to the data (see the (app) layout).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() validates the JWT and refreshes it when needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/search";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
