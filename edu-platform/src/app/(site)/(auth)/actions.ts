"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { emailSchema, fieldErrors, loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { formValues, type ActionState } from "@/lib/action-state";
import { safeNextPath } from "@/lib/utils";
import { clientIp, userAgent } from "@/server/http";
import { loginWithPassword, registerStudent, requestPasswordReset, resetPassword } from "@/server/auth/service";
import { clearSessionCookie, getCurrentSession, invalidateSession, setSessionCookie } from "@/server/auth/session";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  const values = formValues(fd, ["email"]);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const res = await loginWithPassword(parsed.data.email, parsed.data.password, { ip: await clientIp(), userAgent: await userAgent() });
  if (!res.ok) return { error: res.error, values };
  await setSessionCookie(res.token, res.expiresAt);
  redirect(safeNextPath(fd.get("next") as string | null, "/library"));
}

export async function registerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd, ["fullName", "email", "phone", "gradeId"]);
  const parsed = registerSchema.safeParse({
    fullName: fd.get("fullName"),
    email: fd.get("email"),
    password: fd.get("password"),
    phone: fd.get("phone") || undefined,
    gradeId: fd.get("gradeId") || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (fd.get("password") !== fd.get("passwordConfirm")) {
    return { fieldErrors: { passwordConfirm: "كلمتا المرور غير متطابقتين" }, values };
  }
  if (fd.get("terms") !== "on") return { fieldErrors: { terms: "يجب الموافقة على الشروط والأحكام" }, values };
  const res = await registerStudent(parsed.data, { ip: await clientIp(), userAgent: await userAgent() });
  if (!res.ok) return { error: res.error, values };
  await setSessionCookie(res.token, res.expiresAt);
  redirect(safeNextPath(fd.get("next") as string | null, "/library"));
}

export async function logoutAction() {
  const s = await getCurrentSession();
  if (s) await invalidateSession(s.sessionId);
  await clearSessionCookie();
  redirect("/");
}

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(fd.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values: formValues(fd, ["email"]) };
  await requestPasswordReset(parsed.data, await clientIp());
  return { ok: true, message: "إذا كان البريد مسجلًا لدينا، ستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة خلال دقائق." };
}

const resetSchema = z.object({ token: z.string().min(10).max(100), password: passwordSchema });

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({ token: fd.get("token"), password: fd.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (fd.get("password") !== fd.get("passwordConfirm")) return { fieldErrors: { passwordConfirm: "كلمتا المرور غير متطابقتين" } };
  const res = await resetPassword(parsed.data.token, parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect("/login?reset=1");
}
