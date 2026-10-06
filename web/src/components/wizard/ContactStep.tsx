"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import { contactSchema } from "@/lib/validation";
import { api, type Session } from "./api";

type Field = "name" | "email" | "phone";

export function ContactStep({
  turnstileSiteKey,
  onDone,
}: {
  turnstileSiteKey: string;
  onDone: (session: Session, email: string) => void;
}) {
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const turnstile = useRef<TurnstileInstance>(null);

  const needsTurnstile = Boolean(turnstileSiteKey);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    if (needsTurnstile && !turnstileToken) {
      setFormError("Please complete the verification below.");
      return;
    }
    setSubmitting(true);
    try {
      const session = await api<Session>("/api/submissions", {
        method: "POST",
        body: JSON.stringify({ ...parsed.data, turnstileToken }),
      });
      onDone(session, parsed.data.email);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
      turnstile.current?.reset();
      setTurnstileToken("");
    } finally {
      setSubmitting(false);
    }
  }

  const field = (name: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium">
        {label} <span className="text-red-600">*</span>
      </label>
      <input
        id={name}
        name={name}
        className="input"
        required
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        {...props}
      />
      {errors[name] && (
        <p id={`${name}-error`} className="text-sm text-red-600">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="card space-y-5">
      <h2 className="text-xl font-semibold">Your details</h2>
      {field("name", "Full name", { autoComplete: "name", maxLength: 100 })}
      {field("email", "Email", { type: "email", autoComplete: "email", inputMode: "email", maxLength: 254 })}
      {field("phone", "Phone", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: 25, placeholder: "(416) 555-0123" })}

      {needsTurnstile && (
        <Turnstile
          ref={turnstile}
          siteKey={turnstileSiteKey}
          onSuccess={setTurnstileToken}
          onExpire={() => setTurnstileToken("")}
          onError={() => setTurnstileToken("")}
          options={{ size: "flexible", theme: "light" }}
        />
      )}

      {formError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Next"}
      </button>
    </form>
  );
}
