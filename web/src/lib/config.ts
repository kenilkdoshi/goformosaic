import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  get siteUrl() {
    return optional("SITE_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  get storageAccountName() {
    return required("STORAGE_ACCOUNT_NAME");
  },
  /** Optional override for Azurite in local development. */
  get storageBlobEndpoint() {
    return optional("STORAGE_BLOB_ENDPOINT", `https://${this.storageAccountName}.blob.core.windows.net`);
  },
  get storageQueueEndpoint() {
    return optional("STORAGE_QUEUE_ENDPOINT", `https://${this.storageAccountName}.queue.core.windows.net`);
  },
  get uploadsContainer() {
    return optional("UPLOADS_CONTAINER", "uploads");
  },
  get processingQueue() {
    return optional("PROCESSING_QUEUE", "image-processing");
  },
  get acsConnectionString() {
    return process.env.ACS_CONNECTION_STRING ?? "";
  },
  get emailFrom() {
    return optional("EMAIL_FROM", "DoNotReply@goformosaic.com");
  },
  get adminNotifyEmail() {
    return process.env.ADMIN_NOTIFY_EMAIL ?? "";
  },
  get turnstileSecret() {
    return process.env.TURNSTILE_SECRET_KEY ?? "";
  },
  get adminObjectId() {
    return process.env.ADMIN_OBJECT_ID ?? "";
  },
  get bookingUrl() {
    return optional("BOOKING_URL", "https://goformosaic.com/book");
  },
  get signatureName() {
    return optional("EMAIL_SIGNATURE_NAME", "Kenil");
  },
  get rateLimitSalt() {
    return optional("RATE_LIMIT_SALT", "dev-salt");
  },
};
