import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sizeLabel } from "@/lib/sizes";
import { ADMIN_STATUSES, OPEN_STATUSES, STATUS_LABELS, STATUS_STYLES, describeDue, isOverdue } from "@/lib/status";

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });

type SearchParams = Promise<{ q?: string; status?: string; overdue?: string; page?: string; deleted?: string }>;

export default async function AdminListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const status = (ADMIN_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const overdueOnly = sp.overdue === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const now = new Date();

  const where: Prisma.SubmissionWhereInput = {
    status: status ? (status as Prisma.EnumSubmissionStatusFilter["equals"]) : { not: "DRAFT" },
    ...(overdueOnly ? { dueAt: { lt: now }, status: { in: [...OPEN_STATUSES] } } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/[^\d+]/g, "") || q } },
            { promoCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, overdueCount] = await Promise.all([
    prisma.submission.findMany({
      where,
      orderBy: [{ dueAt: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        name: true,
        email: true,
        status: true,
        printSize: true,
        promoCode: true,
        submittedAt: true,
        dueAt: true,
        _count: { select: { files: true } },
      },
    }),
    prisma.submission.count({ where }),
    prisma.submission.count({ where: { dueAt: { lt: now }, status: { in: [...OPEN_STATUSES] } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q: q || undefined, status, overdue: overdueOnly ? "1" : undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/admin?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      {sp.deleted && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Customer data deleted.</p>
      )}
      {overdueCount > 0 && !overdueOnly && (
        <Link href={qs({ overdue: "1", status: undefined, page: undefined })} className="block rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          ⚠ {overdueCount} request{overdueCount === 1 ? " is" : "s are"} past the 3-day deadline — view
        </Link>
      )}

      <form className="flex flex-col gap-2 sm:flex-row" action="/admin">
        <input name="q" defaultValue={q} placeholder="Search name, email, phone, promo or GFM-…" className="input sm:flex-1" />
        <select name="status" defaultValue={status ?? ""} className="input sm:w-48">
          <option value="">All statuses</option>
          {ADMIN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="size-4" /> Overdue
        </label>
        <button className="btn-primary">Filter</button>
      </form>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="hidden bg-stone-50 text-xs uppercase text-stone-500 md:table-header-group">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Size · Promo</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}className="px-4 py-10 text-center text-stone-500">
                  No requests found.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const overdue = isOverdue(r.status, r.dueAt, now);
              return (
                <tr key={r.id} className={`relative block md:table-row ${overdue ? "bg-red-50/60" : "hover:bg-stone-50"}`}>
                  <td className="block px-4 pt-3 font-mono font-semibold md:table-cell md:py-3">
                    <Link href={`/admin/requests/${r.id}`} className="after:absolute after:inset-0">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="block px-4 md:table-cell md:py-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-stone-500">{r.email}</div>
                  </td>
                  <td className="block px-4 text-stone-600 md:table-cell md:py-3">
                    <div>{sizeLabel(r.printSize)}</div>
                    {r.promoCode && <div className="font-mono text-xs text-stone-500">{r.promoCode}</div>}
                  </td>
                  <td className="hidden px-4 py-3 text-stone-600 md:table-cell">
                    {r.submittedAt ? dateFmt.format(r.submittedAt) : "—"}
                  </td>
                  <td className={`block px-4 md:table-cell md:py-3 ${overdue ? "font-semibold text-red-700" : "text-stone-600"}`}>
                    {(OPEN_STATUSES as readonly string[]).includes(r.status) ? describeDue(r.dueAt, now) : "—"}
                  </td>
                  <td className="block px-4 pb-3 md:table-cell md:py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                    {overdue && <span className="ml-2 rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">Overdue</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="underline">← Previous</Link> : <span />}
          <span className="text-stone-500">Page {page} of {pages} · {total} requests</span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className="underline">Next →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
