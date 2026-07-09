import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection at the edge: unauthenticated requests to app pages are
 * redirected to /sign-in. This is a fast cookie-presence check only —
 * real authorization happens server-side in requireUser/requireWorkspace,
 * which validate the session and workspace membership on every request.
 */
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/api/auth"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const hasSessionCookie =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");

  if (!isPublic && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }
  if (isPublic && hasSessionCookie && pathname !== "/api/auth" && !pathname.startsWith("/api/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
