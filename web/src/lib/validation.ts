import { z } from "zod";
import { PRINT_SIZE_IDS, isSizeEnabled } from "./sizes";

// Accepts common North American and international formats; normalised to digits with optional leading +.
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your full name.").max(100, "Name is too long."),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Please enter a valid email address.")),
  phone: z
    .string()
    .trim()
    .max(25)
    .transform(normalizePhone)
    .refine((p) => /^\+?\d{10,15}$/.test(p), "Please enter a valid phone number (10–15 digits)."),
});

export const createSubmissionSchema = contactSchema.extend({
  turnstileToken: z.string().max(4096).optional().default(""),
});

export const createFileSchema = z.object({
  kind: z.enum(["BASE", "TILE"]),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  type: z.string().max(100).default(""),
});

export const submitSchema = z.object({
  consentPrivacy: z.literal(true, { error: "You must accept the Privacy Policy." }),
  consentVersion: z.string().max(40),
  marketingOptIn: z.boolean().default(false),
  printSize: z
    .enum(PRINT_SIZE_IDS, { error: "Please choose a size." })
    .refine(isSizeEnabled, "That size isn't available yet. Please choose another."),
  promoCode: z
    .string()
    .trim()
    .max(40, "Promo code is too long.")
    .transform((s) => s.toUpperCase())
    .optional()
    .default(""),
});

export type ContactInput = z.infer<typeof contactSchema>;

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}
