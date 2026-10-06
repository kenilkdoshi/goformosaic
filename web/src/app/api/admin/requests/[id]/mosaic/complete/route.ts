import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { checkAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sniffImage } from "@/lib/files";
import { isSameOrigin, jsonError, parseJson } from "@/lib/http";
import { deleteBlob, downloadBlob, paths, uploadBuffer } from "@/lib/storage";
import { createWatermarkedPreview } from "@/lib/watermark";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ path: z.string().max(300) });
type Ctx = { params: Promise<{ id: string }> };

// After the browser upload: validate the mosaic, render the watermarked preview, record both.
export async function POST(req: Request, { params }: Ctx) {
  const auth = checkAdmin(await headers());
  if (!auth.admin) return jsonError(401, "Unauthorized");
  if (!isSameOrigin(req)) return jsonError(403, "Cross-origin request rejected.");
  const { id } = await params;
  const parsed = await parseJson(req, schema);
  if ("response" in parsed) return parsed.response;
  const { path } = parsed.data;
  if (!path.startsWith(`mosaics/${id}/`) || path.includes("..")) return jsonError(400, "Invalid mosaic path.");

  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub || sub.status === "DRAFT") return jsonError(404, "Not found");

  let mosaic: Buffer;
  try {
    mosaic = await downloadBlob(path);
  } catch {
    return jsonError(400, "Mosaic upload not found. Please retry.");
  }
  if (!sniffImage(mosaic.subarray(0, 16))) {
    await deleteBlob(path);
    return jsonError(422, "That file isn't a valid image.");
  }

  let preview: Buffer;
  try {
    preview = await createWatermarkedPreview(mosaic);
  } catch (err) {
    console.error("preview failed", err);
    return jsonError(422, "Couldn't read that image (HEIC mosaics aren't supported for previews — use JPG or PNG).");
  }
  const previewPath = paths.preview(id);
  await uploadBuffer(previewPath, preview, "image/jpeg");

  // Replace any previous mosaic/preview.
  if (sub.mosaicPath && sub.mosaicPath !== path) await deleteBlob(sub.mosaicPath);
  if (sub.previewPath) await deleteBlob(sub.previewPath);

  await prisma.submission.update({
    where: { id },
    data: {
      mosaicPath: path,
      previewPath,
      status: sub.status === "SUBMITTED" || sub.status === "IN_PROGRESS" ? "MOSAIC_READY" : sub.status,
    },
  });
  await audit("mosaic.uploaded", auth.admin.id, sub.reference, { bytes: mosaic.length });
  return NextResponse.json({ ok: true });
}
