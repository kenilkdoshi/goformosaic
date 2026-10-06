import { randomUUID } from "node:crypto";
import { app, type InvocationContext, type Timer } from "@azure/functions";
import { db } from "../lib/db.js";
import { PREFIXES, deletePrefix } from "../lib/storage.js";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 90);
const DRAFT_TTL_HOURS = Number(process.env.DRAFT_TTL_HOURS || 24);

async function purge(submissionId: string): Promise<number> {
  let blobs = 0;
  for (const prefix of PREFIXES) blobs += await deletePrefix(`${prefix}/${submissionId}/`);
  await db().query(`DELETE FROM "Submission" WHERE "id" = $1`, [submissionId]); // cascades to UploadFile
  return blobs;
}

async function audit(action: string, reference: string | null, detail: object) {
  await db().query(
    `INSERT INTO "AuditLog" ("id", "action", "reference", "actor", "detail", "createdAt") VALUES ($1, $2, $3, 'system:retention', $4, now())`,
    [randomUUID(), action, reference, JSON.stringify(detail)],
  );
}

// Daily at 07:00 UTC (~3 AM Toronto): enforce the Privacy Policy retention period.
export async function retentionCleanup(_timer: Timer, context: InvocationContext): Promise<void> {
  const drafts = await db().query<{ id: string }>(
    `SELECT "id" FROM "Submission" WHERE "status" = 'DRAFT' AND "createdAt" < now() - make_interval(hours => $1::int)`,
    [DRAFT_TTL_HOURS],
  );
  for (const { id } of drafts.rows) await purge(id);

  const expired = await db().query<{ id: string; reference: string | null }>(
    `SELECT "id", "reference" FROM "Submission" WHERE "submittedAt" < now() - make_interval(days => $1::int)`,
    [RETENTION_DAYS],
  );
  for (const { id, reference } of expired.rows) {
    try {
      const blobs = await purge(id);
      await audit("submission.deleted", reference, { reason: "retention", retentionDays: RETENTION_DAYS, blobs });
    } catch (err) {
      context.error(`Retention purge failed for ${reference ?? id}`, err);
    }
  }

  const limits = await db().query(`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`);
  context.log(
    `Retention: ${drafts.rowCount} abandoned drafts, ${expired.rowCount} expired submissions, ${limits.rowCount} rate-limit rows removed`,
  );
}

app.timer("retentionCleanup", {
  schedule: "0 0 7 * * *",
  runOnStartup: false,
  handler: retentionCleanup,
});
