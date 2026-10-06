import { NextResponse, type NextRequest } from "next/server";
import { checkAdmin } from "@/lib/auth";

function contentSecurityPolicy(): string {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const endpoint = process.env.STORAGE_BLOB_ENDPOINT || (account ? `https://${account}.blob.core.windows.net` : "");
  // Origin only: a CSP source with a path would match that exact path and block blob URLs beneath it.
  const blob = endpoint ? new URL(endpoint).origin : "";
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${blob}`,
    `connect-src 'self' ${blob}${dev ? " ws:" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withSecurityHeaders(res: NextResponse, isAdmin: boolean): NextResponse {
  res.headers.set("Content-Security-Policy", contentSecurityPolicy());
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (isAdmin) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
  }
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (isAdminPage || isAdminApi) {
    const result = checkAdmin(req.headers);
    if (!result.admin) {
      if (isAdminApi) {
        return withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), true);
      }
      if (result.reason === "unauthenticated") {
        const login = new URL("/.auth/login/aad", req.url);
        login.searchParams.set("post_login_redirect_uri", pathname + search);
        return NextResponse.redirect(login);
      }
      const message =
        result.reason === "misconfigured"
          ? "Admin sign-in is not configured on this server."
          : "Your account is not authorised to access this area.";
      return withSecurityHeaders(new NextResponse(message, { status: 403 }), true);
    }
  }
  return withSecurityHeaders(NextResponse.next(), isAdminPage || isAdminApi);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
