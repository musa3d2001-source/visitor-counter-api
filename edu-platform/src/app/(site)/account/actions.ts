"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertUser } from "@/server/auth/guards";
import { getCurrentSession } from "@/server/auth/session";
import { changePassword } from "@/server/auth/service";
import { sql } from "@/server/db";
import { fieldErrors, fullNameSchema, optionalPhoneSchema, passwordSchema } from "@/lib/validation";
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
  await sql`
    update users set full_name = ${parsed.data.fullName}, phone = ${parsed.data.phone},
      grade_id = (select id from grades where id = ${parsed.data.gradeId ?? null} and is_published)
    where id = ${user.id}
  `;
  revalidatePath("/account");
  return { ok: true, message: "تم حفظ بياناتك" };
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  if (!session) return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  const next = passwordSchema.safeParse(fd.get("newPassword"));
  if (!next.success) return { fieldErrors: { newPassword: next.error.issues[0].message } };
  if (fd.get("newPassword") !== fd.get("confirmPassword")) return { fieldErrors: { confirmPassword: "كلمتا المرور غير متطابقتين" } };
  const res = await changePassword(session.user.id, String(fd.get("currentPassword") ?? ""), next.data, session.sessionId);
  if (!res.ok) return { fieldErrors: { currentPassword: res.error } };
  return { ok: true, message: "تم تغيير كلمة المرور وتسجيل الخروج من الأجهزة الأخرى" };
}
