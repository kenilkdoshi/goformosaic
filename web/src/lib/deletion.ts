import "server-only";
import { prisma } from "./db";
import { deleteSubmissionBlobs } from "./storage";
import { audit } from "./admin";

/** Permanently deletes a submission's blobs and database rows. Leaves a PII-free audit entry. */
export async function deleteSubmissionData(submissionId: string, actor: string, reason: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, select: { reference: true } });
  if (!submission) return false;
  const blobs = await deleteSubmissionBlobs(submissionId);
  await prisma.submission.delete({ where: { id: submissionId } });
  await audit("submission.deleted", actor, submission.reference, { reason, blobs });
  return true;
}
