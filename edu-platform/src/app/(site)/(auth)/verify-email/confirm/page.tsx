import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/site/auth-card";
import { Alert } from "@/components/ui/alert";
import { ConfirmEmailForm } from "../verify-forms";
import { authPagePerks } from "@/server/platform/site-facts";

export const metadata: Metadata = { title: "تأكيد البريد الإلكتروني", robots: { index: false }, referrer: "no-referrer" };

/** شكل الرمز كما تولّده المنصة، وصحته تُفحص عند الضغط فقط: برامج فحص البريد تفتح الروابط وحدها */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{10,100}$/;

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const perks = await authPagePerks();
  const { token: raw } = await searchParams;
  const token = typeof raw === "string" ? raw.trim() : "";
  if (!TOKEN_SHAPE.test(token)) {
    return (
      <AuthCard perks={perks} title="تأكيد البريد الإلكتروني">
        <div className="flex flex-col gap-5">
          <Alert tone="danger" title="الرابط غير صالح">
            افتح الرابط من الرسالة كما هو، أو اطلب رابطًا جديدًا.
          </Alert>
          <Link href="/verify-email" className="btn btn-3d btn-primary btn-lg w-full">
            طلب رابط جديد
          </Link>
        </div>
      </AuthCard>
    );
  }
  return (
    <AuthCard perks={perks} title="تأكيد البريد الإلكتروني" subtitle="خطوة واحدة: اضغط الزر لنتأكد أن هذا البريد لك">
      <ConfirmEmailForm token={token} />
    </AuthCard>
  );
}
