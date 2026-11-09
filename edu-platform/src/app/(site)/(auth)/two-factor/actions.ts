"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { safeNextPath } from "@/lib/utils";
import { clientIp, userAgent } from "@/server/http";
import { getCurrentSession, setSessionCookie } from "@/server/auth/session";
import { clearLoginChallengeCookie, readLoginChallengeCookie } from "@/server/auth/challenge-cookie";
import { completeTwoFactorLogin } from "@/server/auth/service";
import { confirmTwoFactorEnrolment } from "@/server/auth/two-factor";

export async function verifyLoginCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const next = safeNextPath(fd.get("next") as string | null, "/admin");
  const res = await completeTwoFactorLogin(await readLoginChallengeCookie(), fd.get("code"), { ip: await clientIp(), userAgent: await userAgent() });
  if (!res.ok) {
    if (!res.expired) return { error: res.error };
    await clearLoginChallengeCookie();
    redirect(`/login?twoFactor=expired&next=${encodeURIComponent(next)}`);
  }
  await clearLoginChallengeCookie();
  await setSessionCookie(res.token, res.expiresAt);
  if (res.mustChangePassword) redirect("/change-password");
  redirect(next);
}

/**
 * تأكيد التسجيل. لا يغيّر كوكي ولا يعيد تحميل الصفحة حتى تبقى الرموز في حالة النموذج:
 * أي تغيير لكوكي يعيد رسم الصفحة، وهي تحوّل الحساب المفعّل بعيدًا فتضيع الرموز قبل قراءتها.
 */
export async function confirmTwoFactorSetupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  if (!session || session.mustChangePassword || session.user.role !== "admin") return { error: "انتهت الجلسة، سجّل الدخول مرة أخرى" };
  const res = await confirmTwoFactorEnrolment({ userId: session.user.id, sessionId: session.sessionId, code: fd.get("code"), ip: await clientIp() });
  if (!res.ok) return { error: res.error };
  return { ok: true, message: "تم تفعيل التحقق بخطوتين", secrets: { recoveryCodes: res.recoveryCodes.join("\n") } };
}
