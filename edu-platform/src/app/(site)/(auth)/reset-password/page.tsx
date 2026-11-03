import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="تعيين كلمة مرور جديدة" subtitle="خطوة أخيرة: اكتب كلمة المرور الجديدة مرتين ثم احفظها">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <div className="flex flex-col gap-5">
          <Alert tone="danger" title="الرابط غير مكتمل">
            افتح الرابط من رسالة البريد كما هو، أو <Link href="/forgot-password">اطلب رابطًا جديدًا</Link>.
          </Alert>
          <Link href="/forgot-password" className="btn btn-3d btn-primary btn-lg w-full">
            <RotateCcw aria-hidden />
            إرسال رابط جديد
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
