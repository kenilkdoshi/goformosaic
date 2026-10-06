// Admin authentication via App Service Authentication ("Easy Auth") with Microsoft Entra ID.
// When Easy Auth is enabled, App Service strips any client-supplied x-ms-client-principal*
// headers and injects verified ones, so they can be trusted here. We additionally pin the
// single permitted admin by Entra object ID.

export type Admin = { id: string; name: string };

type Principal = { claims?: { typ: string; val: string }[] };

const AMR_CLAIMS = new Set(["amr", "http://schemas.microsoft.com/claims/authnmethodsreferences"]);

function hasMfaClaim(encoded: string | null): boolean {
  if (!encoded) return false;
  try {
    const principal = JSON.parse(atob(encoded)) as Principal;
    return (principal.claims ?? []).some((c) => AMR_CLAIMS.has(c.typ) && c.val === "mfa");
  } catch {
    return false;
  }
}

export type AdminCheck = { admin: Admin } | { admin: null; reason: "unauthenticated" | "forbidden" | "misconfigured" };

export function checkAdmin(headers: Headers): AdminCheck {
  if (process.env.NODE_ENV !== "production" && process.env.ADMIN_DEV_BYPASS === "true") {
    return { admin: { id: "dev", name: "Developer (local bypass)" } };
  }
  const allowedId = process.env.ADMIN_OBJECT_ID;
  if (process.env.WEBSITE_AUTH_ENABLED?.toLowerCase() !== "true" || !allowedId) {
    return { admin: null, reason: "misconfigured" };
  }
  const id = headers.get("x-ms-client-principal-id");
  if (!id) return { admin: null, reason: "unauthenticated" };
  if (id.toLowerCase() !== allowedId.toLowerCase()) return { admin: null, reason: "forbidden" };
  if (process.env.ADMIN_REQUIRE_MFA_CLAIM === "true" && !hasMfaClaim(headers.get("x-ms-client-principal"))) {
    return { admin: null, reason: "forbidden" };
  }
  return { admin: { id, name: headers.get("x-ms-client-principal-name") ?? "Admin" } };
}
