import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { headers } from "next/headers";
import { checkAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { uploadsContainer } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Lazily opens the blob only when archiver gets to this entry, so files stream one at a time. */
function lazyBlobStream(path: string): Readable {
  async function* chunks() {
    const res = await uploadsContainer().getBlobClient(path).download();
    for await (const chunk of res.readableStreamBody!) yield chunk;
  }
  return Readable.from(chunks());
}

function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 60) || "photo";
}

export async function GET(_req: Request, { params }: Ctx) {
  const admin = checkAdmin(await headers());
  if (!admin.admin) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const sub = await prisma.submission.findUnique({
    where: { id },
    include: { files: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] } },
  });
  if (!sub?.reference) return jsonError(404, "Not found");

  // Photos are already compressed; "store" avoids burning CPU on deflate.
  const archive = new ZipArchive({ store: true });
  let tileIndex = 0;
  for (const file of sub.files) {
    const path = file.processedPath ?? file.rawPath;
    const ext = path.split(".").pop();
    const name =
      file.kind === "BASE"
        ? `base-${safeName(file.originalName)}.${ext}`
        : `tiles/${String(++tileIndex).padStart(2, "0")}-${safeName(file.originalName)}.${ext}`;
    archive.append(lazyBlobStream(path), { name });
  }
  if (sub.mosaicPath) archive.append(lazyBlobStream(sub.mosaicPath), { name: `mosaic.${sub.mosaicPath.split(".").pop()}` });
  void archive.finalize();

  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${sub.reference}.zip"`,
      "cache-control": "no-store",
    },
  });
}
