import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ContactLinks, realContactLinks } from "@/components/site/payment-unavailable-notice";
import { mailIsReal } from "@/server/platform/mailer";
import { getSettings } from "@/server/platform/settings";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "استعادة كلمة المرور", robots: { index: false } };

export default async function ForgotPasswordPage() {
  if (mailIsReal()) {
    return (
      <AuthCard title="نسيت كلمة المرور؟" subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابطًا لتعيين كلمة مرور جديدة">
        <ForgotForm />
      </AuthCard>
    );
  }
  // البريد لا يخرج: لا نعرض نموذجًا يَعِد برسالة لن تصل. إدارة المنصة تصدر الرابط من صفحة الطالب
  const settings = await getSettings();
  return (
    <AuthCard title="نسيت كلمة المرور؟" subtitle="إدارة المنصة تساعدك في استعادة حسابك">
      <div className="flex flex-col gap-5" data-testid="recovery-mail-off">
        <Alert tone="warning" title="لا يمكن إرسال رابط الاستعادة حاليًا">
          {realContactLinks(settings).length ? (
            <>
              <p>إرسال البريد غير مفعّل على المنصة. تواصل معنا بذكر بريد حسابك لنصدر لك رابطًا جديدًا:</p>
              <ContactLinks settings={settings} testId="recovery-contacts" />
            </>
          ) : (
            <p>إرسال البريد غير مفعّل على المنصة. تواصل مع إدارة المنصة بذكر بريد حسابك لتصدر لك رابطًا جديدًا.</p>
          )}
        </Alert>
        <Link href="/login" className="btn btn-3d btn-primary btn-lg w-full">
          <ArrowRight aria-hidden />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </AuthCard>
  );
}
