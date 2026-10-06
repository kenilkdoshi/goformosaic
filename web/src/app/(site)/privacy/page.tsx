import type { Metadata } from "next";
import { CONSENT_VERSION, TURNAROUND_DAYS, siteSettings } from "@/lib/public-config";

export const metadata: Metadata = { title: "Privacy Policy — GoForMosaic" };
export const dynamic = "force-dynamic";

const effective = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(
  new Date(`${CONSENT_VERSION}T00:00:00Z`),
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  const { privacyEmail: PRIVACY_CONTACT_EMAIL, retentionDays: RETENTION_DAYS } = siteSettings();
  const mail = (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-medium text-brand-700 underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  );
  return (
    <article className="card space-y-6 leading-relaxed text-stone-700">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-stone-900">Privacy Policy</h1>
        <p className="text-sm text-stone-500">
          Version {CONSENT_VERSION} · Effective {effective}
        </p>
      </header>

      <p>
        GoForMosaic (&ldquo;we&rdquo;, &ldquo;us&rdquo;) respects your privacy. This policy explains how we collect,
        use, store and delete your personal information when you order a photo mosaic at goformosaic.com. We handle
        personal information in line with Canada&apos;s <em>Personal Information Protection and Electronic Documents
        Act</em> (PIPEDA) and its ten fair information principles.
      </p>

      <Section title="1. Accountability">
        <p>
          Our Privacy Officer is responsible for our compliance with this policy. You can reach them at {mail}.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Contact details:</strong> your name, email address and phone number.
          </li>
          <li>
            <strong>Photos:</strong> the base image and tile photos you upload, which may show you or other people.
          </li>
          <li>
            <strong>Consent records:</strong> the version of this policy you agreed to, the date and time you agreed,
            and whether you opted in to marketing emails.
          </li>
          <li>
            <strong>Technical data:</strong> limited security and diagnostic data (for example, a one-way hash of
            your IP address used for abuse prevention, and error logs).
          </li>
        </ul>
        <p>We do not collect payment information through this website.</p>
      </Section>

      <Section title="3. Why we collect it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To create your custom mosaic from the photos you provide.</li>
          <li>To email you a confirmation, your reference number and a preview of your finished mosaic.</li>
          <li>To contact you by email or phone about your order, including booking a call to order a print or frame.</li>
          <li>To protect the service against spam and abuse.</li>
          <li>
            Only if you opt in: to send you occasional emails about GoForMosaic offers. You can withdraw this consent
            at any time without affecting your order.
          </li>
        </ul>
        <p>
          We do not sell, rent or trade your personal information, and we do not use your photos for any other purpose
          (such as advertising or training AI models) without your separate, express consent.
        </p>
      </Section>

      <Section title="4. Consent">
        <p>
          We ask for your express consent before you submit your order. Because your photos may include other people,
          you confirm that you have the right to share them with us. You may withdraw consent at any time by emailing{" "}
          {mail}; we will then stop processing and delete your information as described below.
        </p>
      </Section>

      <Section title="5. Where your information is stored">
        <p>
          Your information and photos are stored on Microsoft Azure servers in the <strong>Canada Central</strong>{" "}
          region (Toronto, Ontario). Photos are stored in private, encrypted storage that is not publicly accessible.
        </p>
        <p>
          We use a small number of service providers who process information on our behalf under contractual
          safeguards: Microsoft Azure (hosting, storage, email delivery) and Cloudflare Turnstile (bot protection on
          our form, which processes limited browser and network signals and may do so outside Canada).
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We aim to deliver your mosaic preview within {TURNAROUND_DAYS} days. We keep your contact details and
          photos for up to <strong>{RETENTION_DAYS} days</strong> after you submit your order, so we can answer
          questions and help with print orders. After that, they are automatically and permanently deleted. Incomplete
          submissions that are never finalised are deleted within 24 hours. Residual copies in encrypted backups
          and deleted-file recovery are overwritten within a further 7 days.
        </p>
        <p>
          We keep a minimal record (your order reference number and the date of deletion, without your name or photos)
          to show that deletion took place.
        </p>
      </Section>

      <Section title="7. How we protect it">
        <p>
          We use encryption in transit and at rest, private storage with time-limited access links, multi-factor
          authentication for administrative access, and access limited to the people who need it to fulfil your
          order.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>You may, at any time:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>ask what personal information we hold about you and request a copy;</li>
          <li>ask us to correct inaccurate information;</li>
          <li>ask us to delete your information and photos before the {RETENTION_DAYS}-day period ends;</li>
          <li>withdraw your consent to marketing emails.</li>
        </ul>
        <p>
          Email {mail} with your reference number (GFM-YYYY-NNNN). We will respond within 30 days. We may need to
          verify your identity before acting on a request.
        </p>
      </Section>

      <Section title="9. Questions and complaints">
        <p>
          Please contact our Privacy Officer at {mail} first. If you are not satisfied with our response, you can
          contact the{" "}
          <a href="https://www.priv.gc.ca" className="underline" rel="noopener noreferrer" target="_blank">
            Office of the Privacy Commissioner of Canada
          </a>
          .
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          If we change this policy, we will update the version and effective date above. The version you agreed to is
          recorded with your order.
        </p>
      </Section>
    </article>
  );
}
