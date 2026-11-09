import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { getCurrentSession } from "@/server/auth/session";
import { logoutAction } from "../actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "اختر كلمة مرور جديدة", robots: { index: false } };

/** المحطة الوحيدة لجلسة كلمة المرور المؤقتة: لا صفحة أخرى تفتح قبل تعيين كلمة خاصة */
export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/account");
  return (
    <AuthCard title="اختر كلمة مرور جديدة" subtitle="دخلت بكلمة مرور مؤقتة، ولن يفتح حسابك قبل أن تختار كلمتك الخاصة">
      <ChangePasswordForm />
      <form action={logoutAction} className="mt-3">
        <button type="submit" className="btn btn-ghost btn-md w-full">
          <LogOut aria-hidden />
          تسجيل الخروج
        </button>
      </form>
    </AuthCard>
  );
}
