import { app, type InvocationContext } from "@azure/functions";
import { compressImage, makeThumbnail } from "../lib/compress.js";
import { db } from "../lib/db.js";
import { uploads } from "../lib/storage.js";

type Message = { submissionId: string; fileId: string };

const MAX_DEQUEUE = 5; // keep in sync with host.json extensions.queues.maxDequeueCount

export async function processImage(message: unknown, context: InvocationContext): Promise<void> {
  const { submissionId, fileId } = message as Message;
  if (typeof submissionId !== "string" || typeof fileId !== "string") {
    context.error("Malformed message", message);
    return;
  }

  const { rows } = await db().query<{ rawPath: string; status: string }>(
    `SELECT "rawPath", "status" FROM "UploadFile" WHERE "id" = $1 AND "submissionId" = $2`,
    [fileId, submissionId],
  );
  const file = rows[0];
  if (!file) return context.log(`File ${fileId} no longer exists (deleted) — skipping`);
  if (file.status === "PROCESSED") return context.log(`File ${fileId} already processed`);

  await db().query(`UPDATE "UploadFile" SET "status" = 'PROCESSING', "updatedAt" = now() WHERE "id" = $1`, [fileId]);

  try {
    const container = uploads();
    const original = await container.getBlobClient(file.rawPath).downloadToBuffer();
    const result = await compressImage(original);
    const thumb = await makeThumbnail(result.buffer);

    const processedPath = `processed/${submissionId}/${fileId}.jpg`;
    const thumbPath = `thumbs/${submissionId}/${fileId}.webp`;
    await container.getBlockBlobClient(processedPath).uploadData(result.buffer, {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
    });
    await container.getBlockBlobClient(thumbPath).uploadData(thumb, {
      blobHTTPHeaders: { blobContentType: "image/webp" },
    });

    await db().query(
      `UPDATE "UploadFile" SET "status" = 'PROCESSED', "processedPath" = $2, "processedBytes" = $3,
         "thumbPath" = $4, "width" = $5, "height" = $6, "error" = NULL, "updatedAt" = now()
       WHERE "id" = $1`,
      [fileId, processedPath, result.buffer.length, thumbPath, result.width, result.height],
    );
    await container.getBlobClient(file.rawPath).deleteIfExists();
    context.log(
      `Processed ${fileId}: ${original.length} → ${result.buffer.length} bytes${result.keptOriginal ? " (kept original)" : ""}`,
    );
  } catch (err) {
    const dequeueCount = Number(context.triggerMetadata?.dequeueCount ?? 1);
    const reason = err instanceof Error ? err.message : String(err);
    context.error(`Processing ${fileId} failed (attempt ${dequeueCount}): ${reason}`);
    if (dequeueCount >= MAX_DEQUEUE) {
      // Final attempt: keep the original so the admin can still download it.
      await db().query(
        `UPDATE "UploadFile" SET "status" = 'FAILED', "error" = $2, "updatedAt" = now() WHERE "id" = $1`,
        [fileId, reason.slice(0, 500)],
      );
      return;
    }
    await db().query(`UPDATE "UploadFile" SET "status" = 'UPLOADED', "updatedAt" = now() WHERE "id" = $1`, [fileId]);
    throw err; // let the queue retry
  }
}

app.storageQueue("processImage", {
  queueName: "image-processing",
  connection: "AzureWebJobsStorage",
  handler: processImage,
});
