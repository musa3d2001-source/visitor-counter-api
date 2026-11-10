import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { QrCode } from "@/components/ui/qr-code";
import { getCurrentSession } from "@/server/auth/session";
import { authPagePerks } from "@/server/platform/site-facts";
import { beginTwoFactorEnrolment } from "@/server/auth/two-factor";
import { getPublicSettings } from "@/server/platform/public-settings";
import { TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor";
import { logoutAction } from "../../actions";
import { TwoFactorSetupForm } from "./setup-form";

export const metadata: Metadata = { title: "تفعيل التحقق بخطوتين", robots: { index: false } };

/**
 * تسجيل التحقق بخطوتين، وهي المحطة الوحيدة لمدير لم يسجّله وهو إلزامي: كل ما عداها يعيده إلى هنا.
 * خارج /admin عن قصد، لأن تخطيط اللوحة نفسه يرفض هذه الجلسة.
 */
export default async function TwoFactorSetupPage() {
  const perks = await authPagePerks();
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(TWO_FACTOR_SETUP_PATH)}`);
  if (session.mustChangePassword) redirect("/change-password");
  if (session.user.role !== "admin") notFound();
  const settings = await getPublicSettings();
  const details = await beginTwoFactorEnrolment({ userId: session.user.id, sessionId: session.sessionId, account: session.user.email, issuer: settings.site_name });
  if (!details) redirect("/admin/security");
  return (
    <AuthCard perks={perks} title="فعّل التحقق بخطوتين" subtitle={session.needsTwoFactorEnrolment ? "مطلوب مرة واحدة قبل الدخول إلى لوحة التحكم، لحماية الحساب وعمليات الاسترداد" : "طبقة حماية ثانية بعد كلمة المرور"}>
      <TwoFactorSetupForm manualKey={details.manualKey} otpauthUri={details.otpauthUri} qr={<QrCode value={details.otpauthUri} label="رمز QR لإضافة الحساب إلى تطبيق المصادقة" className="block size-52 rounded-2xl" />} />
      <form action={logoutAction} className="mt-3">
        <button type="submit" className="btn btn-ghost btn-md w-full">
          <LogOut aria-hidden />
          تسجيل الخروج
        </button>
      </form>
    </AuthCard>
  );
}
