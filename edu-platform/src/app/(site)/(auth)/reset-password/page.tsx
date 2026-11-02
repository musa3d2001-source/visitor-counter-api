import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="تعيين كلمة مرور جديدة">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <Alert tone="danger" title="الرابط غير مكتمل">
          افتح الرابط من رسالة البريد كما هو، أو <Link href="/forgot-password">اطلب رابطًا جديدًا</Link>.
        </Alert>
      )}
    </AuthCard>
  );
}
