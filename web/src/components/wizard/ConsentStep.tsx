"use client";

import Link from "next/link";
import { useState } from "react";
import { CONSENT_VERSION } from "@/lib/public-config";
import { PRINT_SIZES, type PrintSizeId } from "@/lib/sizes";
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
  const [size, setSize] = useState<PrintSizeId | "">(() => {
    const enabled = PRINT_SIZES.filter((s) => s.enabled);
    return enabled.length === 1 ? enabled[0].id : "";
  });
  const [promoCode, setPromoCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!size) {
      setError("Please choose a size.");
      return;
    }
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
        body: JSON.stringify({
          consentPrivacy: true,
          consentVersion: CONSENT_VERSION,
          marketingOptIn: marketing,
          printSize: size,
          promoCode,
        }),
      });
      onDone(res.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <div className="card space-y-5">
      <fieldset className="space-y-3">
        <legend className="mb-3 text-xl font-semibold">
          Choose your size <span className="text-red-600">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRINT_SIZES.map((s) => (
            <label
              key={s.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                !s.enabled
                  ? "cursor-not-allowed border-stone-200 bg-stone-50 text-stone-400"
                  : size === s.id
                    ? "cursor-pointer border-brand-700 bg-brand-100 font-medium"
                    : "cursor-pointer border-stone-300 hover:border-stone-400"
              }`}
            >
              <input
                type="radio"
                name="printSize"
                value={s.id}
                className="size-4 shrink-0 accent-brand-700"
                checked={size === s.id}
                disabled={!s.enabled}
                onChange={() => setSize(s.id)}
              />
              <span>
                {s.label}
                {!s.enabled && <span className="block text-xs">Coming soon</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="promoCode" className="block text-sm font-medium">
          Promo code <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="promoCode"
          name="promoCode"
          className="input uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
        />
      </div>

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
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={!size || !consent || submitting}>
          {submitting ? "Creating…" : "Create Mosaic"}
        </button>
      </div>
    </div>
  );
}
