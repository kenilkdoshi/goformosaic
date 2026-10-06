import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDraft } from "@/lib/drafts";
import { CONTENT_TYPES, maxBytesFor, sniffImage } from "@/lib/files";
import { jsonError } from "@/lib/http";
import { deleteBlob, readBlobHead } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

// Called after the browser PUT succeeds: verifies the blob exists, its size, and its magic bytes.
export async function POST(req: Request, { params }: Ctx) {
  const { id, fileId } = await params;
  const submission = await loadDraft(req, id);
  if (!submission) return jsonError(404, "Upload session not found or expired.");

  const file = await prisma.uploadFile.findFirst({ where: { id: fileId, submissionId: id } });
  if (!file) return jsonError(404, "File not found.");
  if (file.status === "UPLOADED") return NextResponse.json({ ok: true });

  const blob = await readBlobHead(file.rawPath);
  if (!blob) {
    console.warn(`[upload-missing] file=${file.id} kind=${file.kind} — /complete called but blob not found`);
    return jsonError(400, "Upload didn't reach storage. Please retry.");
  }

  const reject = async (message: string) => {
    console.warn(`[upload-rejected] file=${file.id} kind=${file.kind} declared=${file.sizeBytes} actual=${blob.size} reason="${message}"`);
    await deleteBlob(file.rawPath);
    await prisma.uploadFile.delete({ where: { id: file.id } });
    return jsonError(422, message);
  };

  if (blob.size > maxBytesFor(file.kind) || blob.size !== file.sizeBytes) {
    return reject("Uploaded file size doesn't match. Please retry.");
  }
  const format = sniffImage(blob.head);
  if (!format) return reject("This file isn't a valid JPG, PNG, HEIC or WEBP image.");

  await prisma.uploadFile.update({
    where: { id: file.id },
    data: { status: "UPLOADED", contentType: CONTENT_TYPES[format] },
  });
  return NextResponse.json({ ok: true });
}
