"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { deleteSubmissionData } from "@/lib/deletion";
import { readyEmail, sendEmail } from "@/lib/email";
import { ADMIN_STATUSES } from "@/lib/status";
import { downloadBlob } from "@/lib/storage";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const idSchema = z.string().min(1).max(40);

export async function updateStatus(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const status = z.enum(ADMIN_STATUSES).safeParse(form.get("status"));
  if (!idSchema.safeParse(id).success || !status.success) return { error: "Invalid status." };
  const sub = await prisma.submission.update({ where: { id }, data: { status: status.data } });
  await audit("status.changed", admin.id, sub.reference, { status: status.data });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin");
  return { ok: true, message: "Status updated." };
}

export async function saveNotes(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const notes = z.string().max(10_000).safeParse(form.get("notes") ?? "");
  if (!notes.success) return { error: "Notes are too long (max 10,000 characters)." };
  await prisma.submission.update({ where: { id }, data: { notes: notes.data } });
  revalidatePath(`/admin/requests/${id}`);
  return { ok: true, message: "Notes saved." };
}

const emailSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required.").max(200),
  above: z.string().trim().min(1, "Message is required.").max(5000),
  below: z.string().trim().max(5000),
});

export async function sendReadyEmail(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = emailSchema.safeParse({ subject: form.get("subject"), above: form.get("above"), below: form.get("below") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid email." };

  const sub = await prisma.submission.findUnique({ where: { id } });
  if (!sub) return { error: "Request not found." };
  if (!sub.previewPath) return { error: "Upload the mosaic first so a preview can be attached." };

  try {
    const preview = await downloadBlob(sub.previewPath);
    await sendEmail({
      to: sub.email,
      ...readyEmail(parsed.data),
      inlineImage: { contentId: "mosaic-preview", name: "mosaic-preview.jpg", contentType: "image/jpeg", data: preview },
    });
  } catch (err) {
    console.error("ready email failed", err);
    return { error: "Email could not be sent. Please try again." };
  }
  await prisma.submission.update({ where: { id }, data: { emailSentAt: new Date(), status: "EMAIL_SENT" } });
  await audit("email.ready_sent", admin.id, sub.reference);
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin");
  return { ok: true, message: `Email sent to ${sub.email}.` };
}

export async function deleteRequest(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const sub = await prisma.submission.findUnique({ where: { id }, select: { reference: true } });
  if (!sub) return { error: "Request not found." };
  const confirm = String(form.get("confirm") ?? "").trim().toUpperCase();
  if (confirm !== (sub.reference ?? "DELETE")) return { error: `Type ${sub.reference ?? "DELETE"} to confirm.` };
  try {
    await deleteSubmissionData(id, admin.id, "admin_request");
  } catch (err) {
    console.error("delete failed", err);
    return { error: "Deletion failed part-way. Please try again." };
  }
  revalidatePath("/admin");
  redirect("/admin?deleted=1");
}
