import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { config } from "./config";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newDraftToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

export function tokenMatches(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash) return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientIp(headers: Headers): string {
  // App Service sets X-Client-IP; X-Forwarded-For may carry "ip:port".
  const direct = headers.get("x-client-ip");
  if (direct) return direct.trim();
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(xff)) return xff.split(":")[0];
  return xff || "unknown";
}

/**
 * Fixed-window rate limit stored in Postgres so it holds across App Service instances.
 * Returns true when the request is allowed. IPs are stored only as salted hashes.
 */
export async function rateLimit(bucket: string, identifier: string, limit: number, windowSeconds: number) {
  const key = `${bucket}:${sha256(identifier + config.rateLimitSalt).slice(0, 32)}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}::int)
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}::int)
                     THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = config.turnstileSecret;
  if (!secret) {
    // Fail closed in production; allow local development without Cloudflare keys.
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
