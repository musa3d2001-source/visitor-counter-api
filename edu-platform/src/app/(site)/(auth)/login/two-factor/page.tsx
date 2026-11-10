import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AuthCard } from "@/components/site/auth-card";
import { getCurrentUser } from "@/server/auth/session";
import { authPagePerks } from "@/server/platform/site-facts";
import { readLoginChallengeCookie } from "@/server/auth/challenge-cookie";
import { loginChallengeIsLive } from "@/server/auth/two-factor";
import { safeNextPath } from "@/lib/utils";
import { TwoFactorLoginForm } from "./two-factor-form";

export const metadata: Metadata = { title: "رمز التحقق", robots: { index: false } };

/** الخطوة الثانية للدخول: تفتح فقط بكوكي خطوة كلمة مرور ما زال ساريًا */
export default async function TwoFactorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const perks = await authPagePerks();
  const sp = await searchParams;
  const next = safeNextPath(sp.next, "/admin");
  if (await getCurrentUser()) redirect(next);
  if (!(await loginChallengeIsLive(await readLoginChallengeCookie()))) redirect(`/login?twoFactor=expired&next=${encodeURIComponent(next)}`);
  return (
    <AuthCard perks={perks} title="أدخل رمز التحقق" subtitle="افتح تطبيق المصادقة واكتب الرمز الظاهر فيه لإكمال الدخول">
      <TwoFactorLoginForm next={next} />
      <div className="mt-3 flex justify-center">
        <Link prefetch={false} href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[0.92rem] font-bold text-brand-700 underline-offset-4 hover:bg-brand-50 hover:underline">
          <ArrowRight className="size-4" aria-hidden />
          الرجوع إلى كلمة المرور
        </Link>
      </div>
    </AuthCard>
  );
}
