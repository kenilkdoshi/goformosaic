import { describe, expect, it } from "vitest";
import { contactSchema } from "@/lib/validation";
import { describeDue, isOverdue } from "@/lib/status";
import { escapeHtml, textToHtml } from "@/lib/email";
import { formatReference } from "@/lib/reference";

describe("contactSchema", () => {
  it("normalises valid input", () => {
    const r = contactSchema.parse({ name: " Jane Doe ", email: "Jane@Example.COM ", phone: "(416) 555-0123" });
    expect(r).toEqual({ name: "Jane Doe", email: "jane@example.com", phone: "4165550123" });
  });
  it("keeps a leading + for international numbers", () => {
    expect(contactSchema.parse({ name: "Al", email: "a@b.co", phone: "+44 20 7946 0958" }).phone).toBe("+442079460958");
  });
  it("rejects bad email and short phone", () => {
    expect(contactSchema.safeParse({ name: "Al", email: "nope", phone: "4165550123" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "Al", email: "a@b.co", phone: "555-0123" }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "A", email: "a@b.co", phone: "4165550123" }).success).toBe(false);
  });
});

describe("deadline helpers", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it("flags overdue only for open statuses", () => {
    const past = new Date("2026-10-04T11:00:00Z");
    expect(isOverdue("SUBMITTED", past, now)).toBe(true);
    expect(isOverdue("IN_PROGRESS", past, now)).toBe(true);
    expect(isOverdue("EMAIL_SENT", past, now)).toBe(false);
    expect(isOverdue("SUBMITTED", new Date("2026-10-05T00:00:00Z"), now)).toBe(false);
  });
  it("describes time remaining", () => {
    expect(describeDue(new Date("2026-10-06T15:00:00Z"), now)).toBe("in 2d 3h");
    expect(describeDue(new Date("2026-10-04T10:30:00Z"), now)).toBe("1h 30m overdue");
  });
});

describe("email helpers", () => {
  it("escapes HTML and linkifies URLs", () => {
    expect(escapeHtml(`<b>"x"&'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
    const html = textToHtml("Hi <Jane>\n\nBook: https://example.com/book");
    expect(html).toContain("Hi &lt;Jane&gt;");
    expect(html).toContain('<a href="https://example.com/book"');
  });
});

describe("formatReference", () => {
  it("pads to four digits", () => {
    expect(formatReference(2026, 7)).toBe("GFM-2026-0007");
    expect(formatReference(2026, 12345)).toBe("GFM-2026-12345");
  });
});
