import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { checkAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CONTENT_TYPES, MB, formatFromName } from "@/lib/files";
import { isSameOrigin, jsonError, parseJson } from "@/lib/http";
import { paths, uploadSasUrl } from "@/lib/storage";

const MOSAIC_MAX_BYTES = 500 * MB;
const schema = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive(), type: z.string().max(100) });

type Ctx = { params: Promise<{ id: string }> };

// Issues a write-only SAS for the admin to upload the finished mosaic directly to Blob Storage.
export async function POST(req: Request, { params }: Ctx) {
  if (!checkAdmin(await headers()).admin) return jsonError(401, "Unauthorized");
  if (!isSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const { id } = await params;
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;

  const format = formatFromName(parsed.data.name);
  if (!format) return jsonError(400, "Mosaic must be JPG, PNG, HEIC or WEBP.");
  if (parsed.data.size > MOSAIC_MAX_BYTES) return jsonError(400, "Mosaic must be 500 MB or smaller.");
  const sub = await prisma.submission.findUnique({ where: { id }, select: { status: true } });
  if (!sub || sub.status === "DRAFT") return jsonError(404, "Not found");

  const path = paths.mosaic(id, format === "jpeg" ? "jpg" : format);
  return NextResponse.json({ uploadUrl: await uploadSasUrl(path), path, contentType: CONTENT_TYPES[format] });
}
