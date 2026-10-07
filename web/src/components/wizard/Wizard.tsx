"use client";

import { useState } from "react";
import { TURNAROUND_DAYS } from "@/lib/public-config";
import type { Session } from "./api";
import { ConsentStep } from "./ConsentStep";
import { ContactStep } from "./ContactStep";
import { UploadStep } from "./UploadStep";
import { useUploads } from "./useUploads";

type Step = 1 | 2 | 3 | "done";

const STEPS = ["Your details", "Upload photos", "Size & confirm"];

export function Wizard({ turnstileSiteKey, retentionDays }: { turnstileSiteKey: string; retentionDays: number }) {
  const [step, setStep] = useState<Step>(1);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const uploads = useUploads(session);

  if (step === "done") {
    return (
      <div className="card space-y-4 text-center" role="status">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-100 text-2xl text-brand-700">
          ✓
        </div>
        <h2 className="text-2xl font-bold">Thank you!</h2>
        <p className="text-lg">
          Your mosaic will be created within {TURNAROUND_DAYS} days. You&apos;ll receive an email.
        </p>
        <div className="rounded-xl bg-stone-100 px-4 py-3">
          <div className="text-sm text-stone-500">Your reference number</div>
          <div className="font-mono text-2xl font-bold tracking-wide">{reference}</div>
        </div>
        <p className="text-sm text-stone-500">A confirmation has been sent to {email}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const complete = typeof step === "number" && step > n;
          return (
            <li key={label} className="flex-1" aria-current={active ? "step" : undefined}>
              <div className={`h-1.5 rounded-full ${active || complete ? "bg-brand-700" : "bg-stone-200"}`} />
              <div className={`mt-1.5 text-xs sm:text-sm ${active ? "font-semibold text-stone-900" : "text-stone-500"}`}>
                {n}. {label}
              </div>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <ContactStep
          turnstileSiteKey={turnstileSiteKey}
          onDone={(s, contactEmail) => {
            setSession(s);
            setEmail(contactEmail);
            setStep(2);
          }}
        />
      )}
      {step === 2 && session && <UploadStep uploads={uploads} onNext={() => setStep(3)} />}
      {step === 3 && session && (
        <ConsentStep
          session={session}
          retentionDays={retentionDays}
          onBack={() => setStep(2)}
          onDone={(ref) => {
            setReference(ref);
            setStep("done");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
