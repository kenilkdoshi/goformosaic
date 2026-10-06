// Constants safe to import from client components.

/** Bump whenever the Privacy Policy text changes materially; stored with each consent. */
export const CONSENT_VERSION = "2026-10-01";
export const TURNAROUND_DAYS = 3;

/**
 * Runtime settings read on the server per request (so App Service settings apply without a
 * rebuild) and passed to client components as props.
 */
export function siteSettings() {
  return {
    privacyEmail: process.env.PRIVACY_CONTACT_EMAIL || "privacy@goformosaic.com",
    retentionDays: Number(process.env.RETENTION_DAYS || 90),
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  };
}
