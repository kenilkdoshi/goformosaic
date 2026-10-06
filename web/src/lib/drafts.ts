import "server-only";
import { prisma } from "./db";
import { bearerToken } from "./http";
import { tokenMatches } from "./security";

/** Loads a DRAFT submission only if the request carries its wizard bearer token. */
export async function loadDraft(req: Request, id: string) {
  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission || submission.status !== "DRAFT") return null;
  if (!tokenMatches(bearerToken(req), submission.draftTokenHash)) return null;
  return submission;
}
