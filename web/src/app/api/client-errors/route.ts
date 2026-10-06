import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/security";

// Browser-side upload failures (e.g. dropped connections during the direct-to-Blob PUT) never
// reach the server otherwise. Logged to the console → App Service console logs → Log Analytics.
const schema = z.object({
  stage: z.enum(["register", "upload", "verify"]),
  message: z.string().max(300),
  kind: z.enum(["BASE", "TILE"]),
  size: z.number().int().nonnegative().max(1e9),
  type: z.string().max(60),
  attempt: z.number().int().min(1).max(100),
  online: z.boolean(),
});

export async function POST(req: Request) {
  if (!(await rateLimit("client-errors", clientIp(req.headers), 200, 3600))) return new NextResponse(null, { status: 204 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (parsed.success) console.warn(`[client-upload-error] ${JSON.stringify(parsed.data)}`);
  return new NextResponse(null, { status: 204 });
}
