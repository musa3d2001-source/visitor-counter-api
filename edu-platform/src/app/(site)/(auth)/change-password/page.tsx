import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { getCurrentSession } from "@/server/auth/session";
import { STAFF_PASSWORD_MIN, STUDENT_PASSWORD_MIN } from "@/lib/password-policy";
import { logoutAction } from "../actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "اختر كلمة مرور جديدة", robots: { index: false } };

/** المحطة الوحيدة لجلسة كلمة المرور المؤقتة: لا صفحة أخرى تفتح قبل تعيين كلمة خاصة */
export default async function ChangePasswordPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/account");
  return (
    <AuthCard
      title="اختر كلمة مرور جديدة"
      subtitle={session.user.role === "student" ? "دخلت بكلمة مرور مؤقتة، ولن يفتح حسابك قبل أن تختار كلمتك الخاصة" : "لن يفتح حسابك قبل أن تختار كلمة مرور جديدة بشروط حسابات الإدارة والمعلمين"}
    >
      {session.user.role === "student" ? <ChangePasswordForm minLength={STUDENT_PASSWORD_MIN} hint="٨ أحرف على الأقل" /> : <ChangePasswordForm minLength={STAFF_PASSWORD_MIN} hint="١٢ حرفًا على الأقل" />}
      <form action={logoutAction} className="mt-3">
        <button type="submit" className="btn btn-ghost btn-md w-full">
          <LogOut aria-hidden />
          تسجيل الخروج
        </button>
      </form>
    </AuthCard>
  );
}
