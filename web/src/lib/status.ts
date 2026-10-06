// Client-safe status metadata shared by admin pages.

export const ADMIN_STATUSES = ["SUBMITTED", "IN_PROGRESS", "MOSAIC_READY", "EMAIL_SENT", "CLOSED"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "New",
  IN_PROGRESS: "In progress",
  MOSAIC_READY: "Mosaic ready",
  EMAIL_SENT: "Email sent",
  CLOSED: "Closed",
};

export const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  SUBMITTED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  MOSAIC_READY: "bg-violet-100 text-violet-800",
  EMAIL_SENT: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-stone-200 text-stone-700",
};

/** Statuses for which the 3-day deadline still applies. */
export const OPEN_STATUSES = ["SUBMITTED", "IN_PROGRESS", "MOSAIC_READY"] as const;

export function isOverdue(status: string, dueAt: Date | null, now = new Date()): boolean {
  return Boolean(dueAt) && (OPEN_STATUSES as readonly string[]).includes(status) && dueAt!.getTime() < now.getTime();
}

export function describeDue(dueAt: Date | null, now = new Date()): string {
  if (!dueAt) return "—";
  const diff = dueAt.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const span = days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((abs % 3_600_000) / 60_000)}m`;
  return diff >= 0 ? `in ${span}` : `${span} overdue`;
}
