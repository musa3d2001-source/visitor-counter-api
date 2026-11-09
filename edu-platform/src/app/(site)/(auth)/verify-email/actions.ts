"use server";

import { emailSchema } from "@/lib/validation";
import { formValues, type ActionState } from "@/lib/action-state";
import { clientIp } from "@/server/http";
import { getCurrentUser } from "@/server/auth/session";
import { confirmEmailToken, requestEmailCorrection, resendEmailVerification } from "@/server/auth/email-verification";

const SESSION_OVER = "انتهت الجلسة، سجّل الدخول مرة أخرى";

export async function resendVerificationAction(): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_OVER };
  const res = await resendEmailVerification(user.id, await clientIp());
  return res.ok ? { ok: true, message: res.message } : { error: res.error };
}

export async function correctEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SESSION_OVER };
  const values = formValues(fd, ["email"]);
  const parsed = emailSchema.safeParse(fd.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values };
  const res = await requestEmailCorrection(user.id, parsed.data, String(fd.get("currentPassword") ?? ""), await clientIp());
  if (!res.ok) return res.field ? { fieldErrors: { [res.field]: res.error }, values } : { error: res.error, values };
  return { ok: true, message: res.message };
}

/** لا يتطلب جلسة: الرمز هو الإثبات، وقد يُفتح الرابط من جهاز آخر */
export async function confirmEmailAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const res = await confirmEmailToken(String(fd.get("token") ?? ""), await clientIp());
  return res.ok ? { ok: true, message: "تم تأكيد بريدك الإلكتروني." } : { error: res.error };
}
