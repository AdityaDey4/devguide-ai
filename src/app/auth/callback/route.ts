import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sends the browser on with a relative Location, so it stays on the host it is already on.
// Building an absolute URL from request.nextUrl.origin breaks when self-hosted with
// `next start`: the origin there is the server's own address (http://localhost:3000),
// not the address in the browser.
function redirectTo(path: string) {
  return new Response(null, { status: 307, headers: { Location: path } });
}

// Keeps `next` on this site. Parsing it the way a browser would catches tricks such as
// "//evil.com", "/\evil.com" or a tab inside the slashes, which a relative Location would
// otherwise follow off-site.
const PLACEHOLDER_ORIGIN = "http://same-site.invalid";
function safeNextPath(raw: string | null): string {
  if (!raw?.startsWith("/")) return "/search";
  const url = new URL(raw, PLACEHOLDER_ORIGIN);
  if (url.origin !== PLACEHOLDER_ORIGIN) return "/search";
  return `${url.pathname}${url.search}${url.hash}`;
}

// Finishes GitHub OAuth and magic-link sign-in (PKCE): swaps the code for a session cookie.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo(next);
  }

  return redirectTo("/login?error=auth");
}
