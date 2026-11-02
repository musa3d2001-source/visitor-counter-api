import type { Metadata } from "next";
import { AuthCard } from "@/components/site/auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "استعادة كلمة المرور", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="نسيت كلمة المرور؟" subtitle="أدخل بريدك الإلكتروني وسنرسل لك رابطًا لتعيين كلمة مرور جديدة">
      <ForgotForm />
    </AuthCard>
  );
}
