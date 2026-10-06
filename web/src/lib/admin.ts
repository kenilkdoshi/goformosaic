import "server-only";
import { headers } from "next/headers";
import { checkAdmin, type Admin } from "./auth";
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";

/** Defense in depth: proxy.ts already gates /admin, but every server action re-checks. */
export async function requireAdmin(): Promise<Admin> {
  const result = checkAdmin(await headers());
  if (!result.admin) throw new Error("Not authorized");
  return result.admin;
}

export async function audit(action: string, actor: string, reference: string | null, detail?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { action, actor, reference, detail } });
}
