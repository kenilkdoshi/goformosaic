import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDraft } from "@/lib/drafts";
import { jsonError } from "@/lib/http";
import { deleteBlob } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  const { id, fileId } = await params;
  const submission = await loadDraft(req, id);
  if (!submission) return jsonError(404, "Upload session not found or expired.");
  const file = await prisma.uploadFile.findFirst({ where: { id: fileId, submissionId: id } });
  if (file) {
    await deleteBlob(file.rawPath);
    // deleteMany is idempotent: a repeated DELETE for the same file is a no-op, not a 500.
    await prisma.uploadFile.deleteMany({ where: { id: file.id } });
  }
  return NextResponse.json({ ok: true });
}
