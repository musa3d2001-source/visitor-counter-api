"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUser } from "@/server/auth/guards";
import { getCurrentSession, getCurrentUser } from "@/server/auth/session";
import { changePassword } from "@/server/auth/service";
import { sql } from "@/server/db";
import { clientIp } from "@/server/http";
import { requestAccountData, withdrawAccountData } from "@/server/platform/data-requests";
import { fieldErrors, fullNameSchema, optionalPhoneSchema, passwordSchema } from "@/lib/validation";
import { isUuid } from "@/lib/uuid";
import type { ActionState } from "@/lib/action-state";

const profileSchema = z.object({
  fullName: fullNameSchema,
  phone: optionalPhoneSchema,
  gradeId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await assertUser();
  const parsed = profileSchema.safeParse({ fullName: fd.get("fullName"), phone: fd.get("phone") || undefined, gradeId: fd.get("gradeId") || undefined });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  // طلب حفظ وصل قبل حذف بيانات الطالب مباشرة لا يعيد اسمه وهاتفه بعد الحذف
  const saved = await sql`
    update users set full_name = ${parsed.data.fullName}, phone = ${parsed.data.phone},
      grade_id = (select id from grades where id = ${parsed.data.gradeId ?? null} and is_published)
    where id = ${user.id} and anonymized_at is null
    returning id
  `;
  if (saved.length === 0) return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  revalidatePath("/account");
  return { ok: true, message: "تم حفظ بياناتك" };
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  // جلسة كلمة المرور المؤقتة تكمل من /change-password فقط
  if (!session || session.mustChangePassword || session.needsTwoFactorEnrolment) return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  const next = passwordSchema.safeParse(fd.get("newPassword"));
  if (!next.success) return { fieldErrors: { newPassword: next.error.issues[0].message } };
  if (fd.get("newPassword") !== fd.get("confirmPassword")) return { fieldErrors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  const res = await changePassword(session.user.id, String(fd.get("currentPassword") ?? ""), next.data, session.sessionId);
  if (!res.ok) return res.field ? { fieldErrors: { [res.field]: res.error } } : { error: res.error };
  return { ok: true, message: "تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى" };
}

const SESSION_OVER = "انتهت الجلسة، سجّل الدخول مرة أخرى";

export async function requestDataAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_OVER };
  const kind = fd.get("kind");
  if (kind !== "delete" && kind !== "copy") return { error: "طلب غير صالح" };
  const res = await requestAccountData({ userId: user.id, kind, ip: await clientIp().catch(() => null) });
  if (!res.ok) return { error: res.error };
  revalidatePath("/account");
  return { ok: true, message: res.message };
}

export async function withdrawDataRequestAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_OVER };
  const requestId = String(fd.get("requestId") ?? "");
  if (!isUuid(requestId)) return { error: "طلب غير صالح" };
  const res = await withdrawAccountData({ userId: user.id, requestId, ip: await clientIp().catch(() => null) });
  if (!res.ok) return { error: res.error };
  revalidatePath("/account");
  return { ok: true, message: res.message };
}
