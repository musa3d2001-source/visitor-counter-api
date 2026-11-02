import type { Metadata } from "next";
import Link from "next/link";
import { LogOut, Receipt } from "lucide-react";
import { requireUser } from "@/server/auth/guards";
import { listUserOrders } from "@/server/commerce/orders";
import { listGrades } from "@/server/catalog/queries";
import { logoutAction } from "../(auth)/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ORDER_STATUS_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ProfileForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "حسابي", robots: { index: false } };

const PAYMENT_MESSAGES: Record<string, string> = {
  invalid: "تعذر التحقق من عملية الدفع. إذا تم الخصم من حسابك تواصل معنا مع رقم الطلب.",
  error: "حدث خطأ أثناء التحقق من الدفع. افتح الطلب واضغط «تحديث الحالة» بعد قليل.",
  rate: "محاولات كثيرة، حاول بعد قليل.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const [orders, grades] = await Promise.all([listUserOrders(user.id), listGrades()]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">حسابي</h1>
          <p className="mt-1 text-muted" dir="auto">{user.email}</p>
        </div>
        <form action={logoutAction}>
          <Button variant="outline" type="submit">
            <LogOut aria-hidden /> تسجيل الخروج
          </Button>
        </form>
      </div>
      {sp.payment && PAYMENT_MESSAGES[sp.payment] ? (
        <Alert tone="warning" className="mt-4">
          {PAYMENT_MESSAGES[sp.payment]}
        </Alert>
      ) : null}

      <section className="mt-8" aria-labelledby="orders-title">
        <h2 id="orders-title" className="mb-4 text-xl font-bold">
          مشترياتي وفواتيري
        </h2>
        {orders.length === 0 ? (
          <EmptyState icon={<Receipt />} title="لا توجد طلبات بعد" description="عند شراء أي مذكرة ستظهر فاتورتها هنا." />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-brand-50/50">
                  <span className="num font-bold">{o.number}</span>
                  <span className="text-sm text-muted">{formatDate(o.created_at)}</span>
                  <span className="text-sm text-muted">
                    <span className="num">{o.item_count}</span> منتج
                  </span>
                  <span className="ms-auto flex items-center gap-2">
                    {o.is_test ? <Badge tone="warning">تجريبي</Badge> : null}
                    <Badge tone={o.status === "paid" ? "success" : o.status === "failed" ? "danger" : o.status === "pending" ? "warning" : "neutral"}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                    <span className="num font-semibold">{filsToKwdString(o.total_fils)} د.ك</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-lg font-bold">بياناتي</h2>
          <ProfileForm user={{ fullName: user.fullName, phone: user.phone, gradeId: user.gradeId }} grades={grades.map((g) => ({ id: g.id, name: g.name }))} />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-lg font-bold">تغيير كلمة المرور</h2>
          <PasswordForm />
        </section>
      </div>
    </div>
  );
}
