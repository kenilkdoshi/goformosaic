import "server-only";
import { EmailClient, type EmailMessage } from "@azure/communication-email";
import { config } from "./config";
import { TURNAROUND_DAYS } from "./public-config";

let client: EmailClient | undefined;

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  inlineImage?: { contentId: string; name: string; contentType: string; data: Buffer };
};

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (!config.acsConnectionString) {
    if (process.env.NODE_ENV === "production") throw new Error("ACS_CONNECTION_STRING is not configured");
    console.info(`[email:dev] to=${email.to} subject=${email.subject}\n${email.text}`);
    return;
  }
  client ??= new EmailClient(config.acsConnectionString);
  const message: EmailMessage = {
    senderAddress: config.emailFrom,
    recipients: { to: [{ address: email.to }] },
    content: { subject: email.subject, html: email.html, plainText: email.text },
    attachments: email.inlineImage
      ? [
          {
            name: email.inlineImage.name,
            contentType: email.inlineImage.contentType,
            contentInBase64: email.inlineImage.data.toString("base64"),
            contentId: email.inlineImage.contentId,
          },
        ]
      : undefined,
  };
  const poller = await client.beginSend(message);
  const result = await poller.pollUntilDone();
  if (result.status !== "Succeeded") throw new Error(`Email send failed: ${result.error?.message ?? result.status}`);
}

// ---------- templates ----------

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Plain text → safe HTML paragraphs with clickable http(s) links. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => {
      const escaped = escapeHtml(para).replace(/\n/g, "<br>");
      const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0f766e">${url}</a>`);
      return `<p style="margin:0 0 16px">${linked}</p>`;
    })
    .join("");
}

function layout(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:bold;color:#0f766e">GoForMosaic</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.5">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

const dateFmt = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "America/Toronto" });

export function confirmationEmail(name: string, reference: string): Omit<OutgoingEmail, "to"> {
  const text = `Hi ${name},

Thanks for your order with GoForMosaic! We've received your photos.

Your mosaic will be created within ${TURNAROUND_DAYS} days. You'll receive an email when it's ready.

Your reference number: ${reference}

If you have any questions, just reply to this email and quote your reference number.

— GoForMosaic`;
  return {
    subject: `We've received your mosaic request (${reference})`,
    text,
    html: layout(
      textToHtml(text).replace(
        escapeHtml(reference),
        `<strong style="font-size:18px;letter-spacing:0.5px">${escapeHtml(reference)}</strong>`,
      ),
    ),
  };
}

export function adminNotificationEmail(args: {
  reference: string;
  name: string;
  tileCount: number;
  printSize: string;
  promoCode: string | null;
  dueAt: Date;
  adminUrl: string;
}): Omit<OutgoingEmail, "to"> {
  const text = `New mosaic request ${args.reference}

Customer: ${args.name}
Size: ${args.printSize}
Promo code: ${args.promoCode ?? "—"}
Tiles: ${args.tileCount} + 1 base image
Due: ${dateFmt.format(args.dueAt)}

Open in admin: ${args.adminUrl}`;
  return { subject: `New mosaic request ${args.reference}`, text, html: layout(textToHtml(text)) };
}

export function defaultReadyEmail(name: string) {
  const first = name.split(/\s+/)[0] || name;
  return {
    subject: "Your mosaic is ready!",
    above: `Hi ${first},\n\nYour mosaic is ready! Here's how it looks.`,
    below: `Book a call to order a large print or frame:\n${config.bookingUrl}\n\nThanks,\n${config.signatureName}\nGoForMosaic`,
  };
}

export function readyEmail(args: { subject: string; above: string; below: string }): Omit<OutgoingEmail, "to" | "inlineImage"> {
  const button = `<p style="margin:8px 0 24px"><a href="${escapeHtml(config.bookingUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Book a call</a></p>`;
  const image = `<p style="margin:0 0 20px"><img src="cid:mosaic-preview" alt="Your mosaic preview" width="544" style="width:100%;max-width:544px;height:auto;border-radius:8px;display:block"></p>`;
  return {
    subject: args.subject,
    text: `${args.above}\n\n[Preview image attached]\n\n${args.below}`,
    html: layout(textToHtml(args.above) + image + button + textToHtml(args.below)),
  };
}
