import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { loadDraft } from "@/lib/drafts";
import { adminNotificationEmail, confirmationEmail, sendEmail } from "@/lib/email";
import { TILE_MAX_COUNT, TILE_MIN_COUNT } from "@/lib/files";
import { jsonError, parseJson } from "@/lib/http";
import { CONSENT_VERSION, TURNAROUND_DAYS } from "@/lib/public-config";
import { nextReference } from "@/lib/reference";
import { clientIp, rateLimit } from "@/lib/security";
import { enqueueProcessing } from "@/lib/storage";
import { submitSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// Step 3: consent → assigns GFM reference, queues compression, emails customer + admin.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await rateLimit("submit", clientIp(req.headers), 10, 3600))) {
    return jsonError(429, "Too many attempts. Please try again later.");
  }
  const submission = await loadDraft(req, id);
  if (!submission) return jsonError(404, "Upload session not found or expired. Please start again.");

  const parsed = await parseJson(req, submitSchema);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.consentVersion !== CONSENT_VERSION) {
    return jsonError(409, "Our Privacy Policy was updated. Please refresh the page and review it.");
  }

  const files = await prisma.uploadFile.findMany({ where: { submissionId: id } });
  const uploaded = files.filter((f) => f.status === "UPLOADED");
  if (uploaded.length !== files.length) return jsonError(400, "Some uploads haven't finished. Please wait or remove them.");
  const bases = uploaded.filter((f) => f.kind === "BASE").length;
  const tiles = uploaded.filter((f) => f.kind === "TILE").length;
  if (bases !== 1) return jsonError(400, "Please upload one base image.");
  if (tiles < TILE_MIN_COUNT || tiles > TILE_MAX_COUNT) {
    return jsonError(400, `Please upload between ${TILE_MIN_COUNT} and ${TILE_MAX_COUNT} tile photos.`);
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + TURNAROUND_DAYS * 24 * 60 * 60 * 1000);
  const updated = await prisma.$transaction(async (tx) => {
    // Guard against double-submit: only transition from DRAFT once.
    const claimed = await tx.submission.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SUBMITTED" },
    });
    if (claimed.count !== 1) return null;
    const reference = await nextReference(tx, now);
    return tx.submission.update({
      where: { id },
      data: {
        reference,
        submittedAt: now,
        dueAt,
        draftTokenHash: null,
        consentPrivacy: true,
        consentVersion: CONSENT_VERSION,
        consentAt: now,
        marketingOptIn: parsed.data.marketingOptIn,
        marketingConsentAt: parsed.data.marketingOptIn ? now : null,
      },
    });
  });
  if (!updated?.reference) return jsonError(409, "This request was already submitted.");

  // Side effects are best-effort: the submission is safely recorded even if one fails.
  const results = await Promise.allSettled([
    enqueueProcessing(uploaded.map((f) => ({ submissionId: id, fileId: f.id }))),
    sendEmail({ to: updated.email, ...confirmationEmail(updated.name, updated.reference) }),
    config.adminNotifyEmail
      ? sendEmail({
          to: config.adminNotifyEmail,
          ...adminNotificationEmail({
            reference: updated.reference,
            name: updated.name,
            tileCount: tiles,
            dueAt,
            adminUrl: `${config.siteUrl}/admin/requests/${id}`,
          }),
        })
      : Promise.resolve(),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("submit side effect failed", r.reason);

  return NextResponse.json({ reference: updated.reference, dueAt: dueAt.toISOString() });
}
