import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, parseJson } from "@/lib/http";
import { clientIp, newDraftToken, rateLimit, verifyTurnstile } from "@/lib/security";
import { createSubmissionSchema } from "@/lib/validation";

// Step 1: contact details → creates a DRAFT submission and returns a bearer token for the wizard.
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!(await rateLimit("create", ip, 5, 3600))) {
    return jsonError(429, "Too many attempts. Please try again in an hour.");
  }
  const parsed = await parseJson(req, createSubmissionSchema);
  if ("response" in parsed) return parsed.response;
  const { name, email, phone, turnstileToken } = parsed.data;

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return jsonError(400, "Verification failed. Please refresh the page and try again.");
  }

  const { token, hash } = newDraftToken();
  const submission = await prisma.submission.create({
    data: { name, email, phone, draftTokenHash: hash },
    select: { id: true },
  });
  return NextResponse.json({ id: submission.id, token }, { status: 201 });
}
