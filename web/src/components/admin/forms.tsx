"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/admin/actions";
import { ADMIN_STATUSES, STATUS_LABELS } from "@/lib/status";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700" role="alert">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-700" role="status">{state.message}</p>;
  return null;
}

export function StatusForm({ action, current }: { action: Action; current: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="status" className="block text-sm font-medium">Status</label>
      <div className="flex gap-2">
        <select id="status" name="status" defaultValue={current} className="input">
          {ADMIN_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button className="btn-primary" disabled={pending}>{pending ? "…" : "Save"}</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function NotesForm({ action, notes }: { action: Action; notes: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="notes" className="block text-sm font-medium">Internal notes</label>
      <textarea id="notes" name="notes" defaultValue={notes} rows={5} maxLength={10000} className="input" />
      <div className="flex items-center gap-3">
        <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save notes"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function EmailComposer({
  action,
  defaults,
  to,
  previewUrl,
  sentAt,
}: {
  action: Action;
  defaults: { subject: string; above: string; below: string };
  to: string;
  previewUrl: string | null;
  sentAt: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        if (sentAt && !confirm("This email was already sent once. Send it again?")) e.preventDefault();
      }}
    >
      <p className="text-sm text-stone-600">
        To: <strong>{to}</strong>
        {sentAt && <span className="ml-2 text-emerald-700">· last sent {sentAt}</span>}
      </p>
      <input name="subject" defaultValue={defaults.subject} className="input" aria-label="Subject" maxLength={200} />
      <textarea name="above" defaultValue={defaults.above} rows={4} className="input" aria-label="Message above preview" />
      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-2 text-center text-xs text-stone-500">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Watermarked preview" className="mx-auto max-h-64 rounded" />
        ) : (
          "Watermarked preview will appear here once the mosaic is uploaded."
        )}
      </div>
      <p className="text-xs text-stone-500">A “Book a call” button linking to your booking page is added below the preview.</p>
      <textarea name="below" defaultValue={defaults.below} rows={6} className="input" aria-label="Message below preview" />
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !previewUrl}>{pending ? "Sending…" : "Send email"}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function DeleteForm({ action, reference }: { action: Action; reference: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [value, setValue] = useState("");
  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-stone-700">
        Permanently deletes this customer&apos;s contact details, photos, mosaic and preview. This cannot be undone.
      </p>
      <label className="block text-sm">
        Type <code className="font-mono font-semibold">{reference}</code> to confirm
        <input name="confirm" value={value} onChange={(e) => setValue(e.target.value)} className="input mt-1" autoComplete="off" />
      </label>
      <button
        className="inline-flex min-h-12 items-center rounded-lg bg-red-700 px-5 font-semibold text-white disabled:opacity-50"
        disabled={pending || value.trim().toUpperCase() !== reference}
      >
        {pending ? "Deleting…" : "Delete customer data"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
