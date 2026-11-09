import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { getCurrentSession, getCurrentUser } from "@/server/auth/session";
import { safeNextPath } from "@/lib/utils";
import { TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor";
import { LoginForm } from "./login-form";
import { MobilePerks } from "../_components/auth-bits";

export const metadata: Metadata = { title: "تسجيل الدخول", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; twoFactor?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/library");
  const session = await getCurrentSession();
  if (session?.mustChangePassword) redirect("/change-password");
  if (session?.needsTwoFactorEnrolment) redirect(TWO_FACTOR_SETUP_PATH);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthCard title="مرحبًا بعودتك" subtitle="سجّل دخولك للوصول إلى مكتبتك ومشترياتك">
      {sp.reset ? (
        <Alert tone="success" className="mb-4">
          تم تغيير كلمة المرور بنجاح. سجّل دخولك بكلمة المرور الجديدة.
        </Alert>
      ) : null}
      {sp.twoFactor === "expired" ? (
        <Alert tone="warning" className="mb-4">
          انتهت مهلة إدخال رمز التحقق. سجّل دخولك من جديد.
        </Alert>
      ) : null}
      {sp.next?.startsWith("/checkout") ? (
        <Alert tone="info" className="mb-4">
          سجّل دخولك أو أنشئ حسابًا لإتمام الشراء. سلتك محفوظة.
        </Alert>
      ) : null}
      <LoginForm next={next} />
      <MobilePerks />
    </AuthCard>
  );
}
