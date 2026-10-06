import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { firstError } from "./validation";

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: jsonError(400, "Invalid JSON body.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { response: jsonError(400, firstError(parsed.error)) };
  return { data: parsed.data };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Rejects cross-site state-changing requests to admin API routes. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
