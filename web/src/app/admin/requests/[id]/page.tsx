import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteRequest, saveNotes, sendReadyEmail, updateStatus } from "@/app/admin/actions";
import { DeleteForm, EmailComposer, NotesForm, StatusForm } from "@/components/admin/forms";
import { MosaicUploader } from "@/components/admin/MosaicUploader";
import { prisma } from "@/lib/db";
import { defaultReadyEmail } from "@/lib/email";
import { formatBytes } from "@/lib/files";
import { STATUS_LABELS, STATUS_STYLES, describeDue, isOverdue } from "@/lib/status";
import { readSasUrl } from "@/lib/storage";

const dateFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-5 ${className}`}>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sub = await prisma.submission.findUnique({
    where: { id },
    include: { files: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] } },
  });
  if (!sub || sub.status === "DRAFT") notFound();

  const now = new Date();
  const overdue = isOverdue(sub.status, sub.dueAt, now);
  const reference = sub.reference ?? sub.id;

  const files = await Promise.all(
    sub.files.map(async (f, i) => {
      const fullPath = f.processedPath ?? f.rawPath;
      const ext = fullPath.split(".").pop();
      const label = f.kind === "BASE" ? "base" : `tile-${String(i).padStart(2, "0")}`;
      return {
        ...f,
        thumbUrl: f.thumbPath ? await readSasUrl(f.thumbPath) : null,
        fullUrl: await readSasUrl(fullPath, `${reference}-${label}.${ext}`),
      };
    }),
  );
  const base = files.find((f) => f.kind === "BASE");
  const tiles = files.filter((f) => f.kind === "TILE");
  const totalBytes = sub.files.reduce((n, f) => n + (f.processedBytes ?? f.sizeBytes), 0);
  const pending = sub.files.filter((f) => f.status !== "PROCESSED" && f.status !== "FAILED").length;
  const previewUrl = sub.previewPath ? await readSasUrl(sub.previewPath) : null;
  const mosaicUrl = sub.mosaicPath ? await readSasUrl(sub.mosaicPath, `${reference}-mosaic.${sub.mosaicPath.split(".").pop()}`) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin" className="text-sm text-stone-500 underline">← All requests</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">{reference}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[sub.status]}`}>
            {STATUS_LABELS[sub.status]}
          </span>
          {overdue && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">Overdue</span>}
        </div>
        <p className={`text-sm ${overdue ? "font-semibold text-red-700" : "text-stone-600"}`}>
          Due {sub.dueAt ? dateFmt.format(sub.dueAt) : "—"} ({describeDue(sub.dueAt, now)})
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Customer">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-stone-500">Name</dt><dd className="font-medium">{sub.name}</dd></div>
            <div><dt className="text-stone-500">Email</dt><dd><a href={`mailto:${sub.email}`} className="underline">{sub.email}</a></dd></div>
            <div><dt className="text-stone-500">Phone</dt><dd><a href={`tel:${sub.phone}`} className="underline">{sub.phone}</a></dd></div>
            <div><dt className="text-stone-500">Submitted</dt><dd>{sub.submittedAt ? dateFmt.format(sub.submittedAt) : "—"}</dd></div>
            <div>
              <dt className="text-stone-500">Consent</dt>
              <dd>Privacy v{sub.consentVersion} · {sub.consentAt ? dateFmt.format(sub.consentAt) : "—"}</dd>
            </div>
            <div><dt className="text-stone-500">Marketing opt-in</dt><dd>{sub.marketingOptIn ? "Yes" : "No"}</dd></div>
          </dl>
        </Card>
        <Card title="Workflow" className="space-y-6 lg:col-span-2">
          <StatusForm action={updateStatus.bind(null, sub.id)} current={sub.status} />
          <NotesForm action={saveNotes.bind(null, sub.id)} notes={sub.notes} />
        </Card>
      </div>

      <Card title={`Photos · 1 base + ${tiles.length} tiles · ${formatBytes(totalBytes)}`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <a href={`/api/admin/requests/${sub.id}/zip`} className="btn-secondary">Download all (ZIP)</a>
          {pending > 0 && <span className="text-sm text-amber-700">{pending} file(s) still being compressed — refresh shortly.</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          {base && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-stone-500">Base image</div>
              <Thumb file={base} large />
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-stone-500">Tiles</div>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {tiles.map((f) => (
                <li key={f.id}><Thumb file={f} /></li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Mosaic">
          <div className="space-y-4">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Watermarked preview" className="w-full rounded-lg border border-stone-200" />
            ) : (
              <p className="text-sm text-stone-500">No mosaic uploaded yet. Uploading creates a watermarked preview (max 1600 px).</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <MosaicUploader submissionId={sub.id} hasMosaic={Boolean(sub.mosaicPath)} />
              {mosaicUrl && <a href={mosaicUrl} className="text-sm underline">Download full mosaic</a>}
            </div>
          </div>
        </Card>
        <Card title="“Mosaic ready” email">
          <EmailComposer
            action={sendReadyEmail.bind(null, sub.id)}
            defaults={defaultReadyEmail(sub.name)}
            to={sub.email}
            previewUrl={previewUrl}
            sentAt={sub.emailSentAt ? dateFmt.format(sub.emailSentAt) : null}
          />
        </Card>
      </div>

      <Card title="Delete customer data" className="border-red-200">
        <DeleteForm action={deleteRequest.bind(null, sub.id)} reference={reference} />
      </Card>
    </div>
  );
}

function Thumb({
  file,
  large,
}: {
  file: { originalName: string; status: string; thumbUrl: string | null; fullUrl: string; width: number | null; height: number | null };
  large?: boolean;
}) {
  return (
    <a
      href={file.fullUrl}
      target="_blank"
      rel="noreferrer"
      title={`${file.originalName}${file.width ? ` · ${file.width}×${file.height}` : ""}`}
      className={`relative block overflow-hidden rounded-lg border border-stone-200 bg-stone-100 ${large ? "aspect-square w-full" : "aspect-square"}`}
    >
      {file.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.thumbUrl} alt={file.originalName} loading="lazy" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center p-1 text-center text-[10px] text-stone-500">
          {file.status === "FAILED" ? "Original (not compressed)" : "Processing…"}
        </span>
      )}
      {file.status === "FAILED" && <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-center text-[10px] text-white">Failed</span>}
    </a>
  );
}
