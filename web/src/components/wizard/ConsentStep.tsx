"use client";

import Link from "next/link";
import { useState } from "react";
import { CONSENT_VERSION } from "@/lib/public-config";
import { api, type Session } from "./api";

export function ConsentStep({
  session,
  retentionDays,
  onBack,
  onDone,
}: {
  session: Session;
  retentionDays: number;
  onBack: () => void;
  onDone: (reference: string) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!consent) {
      setError("Please accept the Privacy Policy to continue.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await api<{ reference: string }>(`/api/submissions/${session.id}/submit`, {
        method: "POST",
        session,
        body: JSON.stringify({ consentPrivacy: true, consentVersion: CONSENT_VERSION, marketingOptIn: marketing }),
      });
      onDone(res.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="card space-y-5">
      <h2 className="text-xl font-semibold">Privacy &amp; consent</h2>
      <div className="space-y-2 rounded-xl bg-stone-50 p-4 text-sm text-stone-700">
        <p>
          We use your name, email, phone number and photos only to create your mosaic and contact you about it. Your
          data is stored in Canada and deleted within {retentionDays} days. You can ask us to delete it sooner at any
          time.
        </p>
        <p>
          <Link href="/privacy" target="_blank" className="font-medium text-brand-700 underline">
            Read the full Privacy Policy
          </Link>
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-brand-700"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span className="text-sm">
          I have read and agree to the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            Privacy Policy
          </Link>
          , and I confirm I have the right to share these photos. <span className="text-red-600">*</span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-brand-700"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
        />
        <span className="text-sm text-stone-700">
          (Optional) Send me occasional emails about GoForMosaic offers. You can unsubscribe at any time.
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <button type="button" className="btn-secondary sm:w-40" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={!consent || submitting}>
          {submitting ? "Creating…" : "Create Mosaic"}
        </button>
      </div>
    </div>
  );
}
