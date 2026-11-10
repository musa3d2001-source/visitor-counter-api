import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ResetForm } from "./reset-form";
import { authPagePerks } from "@/server/platform/site-facts";

export const metadata: Metadata = { title: "تعيين كلمة مرور جديدة", robots: { index: false } };

/**
 * شكل الرمز كما تولّده المنصة (base64url بطول ١٠ إلى ١٠٠ حرف، مثل resetSchema).
 * الرمز الصحيح الشكل الذي انتهت صلاحيته أو استُخدم يُكشف عند الإرسال،
 * فتظهر رسالة «انتهت صلاحية الرابط أو سبق استخدامه» من الخادم.
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{10,100}$/;

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const perks = await authPagePerks();
  const { token: raw } = await searchParams;
  const token = typeof raw === "string" ? raw.trim() : "";
  const problem = !token ? "missing" : TOKEN_SHAPE.test(token) ? null : "invalid";

  if (!problem) {
    return (
      <AuthCard perks={perks} title="تعيين كلمة مرور جديدة" subtitle="خطوة أخيرة: اكتب كلمة المرور الجديدة مرتين ثم احفظها">
        <ResetForm token={token} />
      </AuthCard>
    );
  }

  return (
    <AuthCard perks={perks} title="تعيين كلمة مرور جديدة" subtitle="رابط الاستعادة يعمل مرة واحدة ولمدة محدودة">
      <LinkProblem
        title={problem === "missing" ? "الرابط غير مكتمل" : "الرابط غير صالح"}
        body={
          problem === "missing"
            ? "افتح الرابط من رسالة البريد كما هو، أو اطلب رابطًا جديدًا من الزر أدناه."
            : "قد يكون الرابط قديمًا أو نُسخ ناقصًا. اطلب رابطًا جديدًا من الزر أدناه."
        }
      />
    </AuthCard>
  );
}

/** حالة الرابط المعطوب: تنبيه واحد بعنوان وسطر، ثم إجراء واحد واضح. */
function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Alert tone="danger" title={title}>
        {body}
      </Alert>
      <Link prefetch={false} href="/forgot-password" className="btn btn-3d btn-primary btn-lg w-full">
        <RotateCcw aria-hidden />
        إرسال رابط جديد
      </Link>
    </div>
  );
}
