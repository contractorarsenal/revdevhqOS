import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Session refresh + route protection (Supabase SSR pattern).
 * The Supabase client here revalidates the auth token on each request and
 * keeps the cookies fresh. Authorization (workspace membership, roles) is
 * enforced server-side in requireUser/requireWorkspace — never here alone.
 */
// "/portal/accept-invite" is the tokenized invite landing page — public so
// invited clients can see it before creating an account. "/portal" itself
// (and everything else under it) stays authenticated.
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/auth",
  "/setup-required",
  "/portal/accept-invite",
  "/clientportal/signin",
  "/clientportal/accept-invite",
  "/robots.txt",
  "/sitemap.xml",
];

export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" is the public marketing page — exact match only, so every other
  // route stays protected by default.
  const isPublic = pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const inClientPortal = pathname === "/clientportal" || pathname.startsWith("/clientportal/");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // Logged-out visitors of the client portal go to the portal's own sign-in.
    url.pathname = inClientPortal ? "/clientportal/signin" : "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  // "/clientportal" is only a doorway: authenticated -> dashboard.
  // (Unauthenticated visitors were redirected to the sign-in above.)
  if (user && (pathname === "/clientportal" || pathname === "/clientportal/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/clientportal/dashboard";
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/clientportal/signin") {
    const url = request.nextUrl.clone();
    url.pathname = "/clientportal/dashboard";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
