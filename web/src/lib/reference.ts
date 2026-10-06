import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export function formatReference(year: number, n: number): string {
  return `GFM-${year}-${String(n).padStart(4, "0")}`;
}

export function torontoYear(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric" }).format(date));
}

/** Atomically allocates the next GFM-YYYY-NNNN (Prisma emits INSERT … ON CONFLICT for this upsert). */
export async function nextReference(tx: Prisma.TransactionClient, date = new Date()): Promise<string> {
  const year = torontoYear(date);
  const row = await tx.referenceCounter.upsert({
    where: { year },
    create: { year, last: 1 },
    update: { last: { increment: 1 } },
  });
  return formatReference(year, row.last);
}
