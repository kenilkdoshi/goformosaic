import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDraft } from "@/lib/drafts";
import { CONTENT_TYPES, TILE_MAX_COUNT, checkFileMeta } from "@/lib/files";
import { jsonError, parseJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/security";
import { deleteBlob, paths, uploadSasUrl } from "@/lib/storage";
import { createFileSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// Registers an upload and returns a create/write-only SAS URL for a single blob path.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await rateLimit("files", clientIp(req.headers), 400, 3600))) {
    return jsonError(429, "Too many uploads. Please slow down and try again.");
  }
  const submission = await loadDraft(req, id);
  if (!submission) return jsonError(404, "Upload session not found or expired. Please start again.");

  const parsed = await parseJson(req, createFileSchema);
  if ("response" in parsed) return parsed.response;
  const { kind, name, size, type } = parsed.data;

  const check = checkFileMeta(kind, name, size, type);
  if (!check.ok) return jsonError(400, check.error);

  if (kind === "TILE") {
    const tiles = await prisma.uploadFile.count({ where: { submissionId: id, kind: "TILE" } });
    if (tiles >= TILE_MAX_COUNT) return jsonError(400, `You can upload at most ${TILE_MAX_COUNT} tile photos.`);
  } else {
    // Only one base image: replacing it discards the previous one.
    const previous = await prisma.uploadFile.findMany({ where: { submissionId: id, kind: "BASE" } });
    for (const file of previous) await deleteBlob(file.rawPath);
    await prisma.uploadFile.deleteMany({ where: { submissionId: id, kind: "BASE" } });
  }

  const ext = check.format === "jpeg" ? "jpg" : check.format;
  const file = await prisma.uploadFile.create({
    data: {
      submissionId: id,
      kind,
      originalName: name.slice(0, 255),
      contentType: CONTENT_TYPES[check.format],
      sizeBytes: size,
      rawPath: "",
    },
  });
  const rawPath = paths.raw(id, file.id, ext);
  await prisma.uploadFile.update({ where: { id: file.id }, data: { rawPath } });

  return NextResponse.json(
    { fileId: file.id, uploadUrl: await uploadSasUrl(rawPath), contentType: CONTENT_TYPES[check.format] },
    { status: 201 },
  );
}
