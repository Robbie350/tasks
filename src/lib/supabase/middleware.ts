import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

// Paths reachable without being signed in.
// /api/telegram is called by Telegram and checks its own secret.
const PUBLIC_PATHS = ["/login", "/api/health", "/api/telegram"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Runs on every request: refreshes the Supabase session cookie and sends
 * signed-out visitors to /login. This is only a convenience redirect;
 * real access control is enforced by RLS in the database.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          response.headers.set(key, value)
        );
      },
    },
  });

  // Verifies the session token (don't use getSession() here: it isn't verified).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn && !isPublic(pathname)) return redirectTo("/login");

  if (signedIn && pathname === "/login") {
    // A signed-in user whose account is deactivated (or has no profile) is sent
    // here by requireProfile(); end their session and show the login page.
    if (request.nextUrl.searchParams.get("error") === "inactive") {
      await supabase.auth.signOut();
      return response;
    }
    return redirectTo("/");
  }

  return response;
}
