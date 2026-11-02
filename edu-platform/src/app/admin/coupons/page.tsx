import Link from "next/link";
import { Pencil, Ticket, Trash2 } from "lucide-react";
import { listCoupons } from "@/server/admin/records";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { CouponForm } from "@/components/admin/coupon-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "./actions";

export const metadata = { title: "الكوبونات" };

function couponState(c: { is_active: boolean; starts_at: Date | null; ends_at: Date | null; max_redemptions: number | null; redemptions: number }) {
  const now = Date.now();
  if (!c.is_active) return { label: "موقوف", tone: "neutral" as const };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "منتهي", tone: "danger" as const };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "لم يبدأ", tone: "warning" as const };
  if (c.max_redemptions !== null && c.redemptions >= c.max_redemptions) return { label: "استُنفد", tone: "danger" as const };
  return { label: "فعّال", tone: "success" as const };
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const sp = await searchParams;
  const coupons = await listCoupons();
  return (
    <div className="space-y-6">
      <AdminPageHeader title="الكوبونات" description="أكواد خصم بسيطة بنسبة مئوية أو مبلغ ثابت. يُحسب الخصم دائمًا على الخادم." />
      {sp.created ? <Alert tone="success">تم إنشاء الكوبون.</Alert> : null}

      {coupons.length === 0 ? (
        <EmptyState icon={<Ticket />} title="لا توجد كوبونات بعد" description="أنشئ أول كود خصم من النموذج أدناه." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>الكود</TH>
              <TH>الخصم</TH>
              <TH>الحد الأدنى</TH>
              <TH>الاستخدام</TH>
              <TH>الفترة</TH>
              <TH>الحالة</TH>
              <TH>إجراءات</TH>
            </tr>
          </THead>
          <tbody>
            {coupons.map((c) => {
              const st = couponState(c);
              return (
                <TR key={c.id}>
                  <TD>
                    <span className="num font-bold tracking-wide" dir="ltr">
                      {c.code}
                    </span>
                    {c.note ? <p className="text-xs text-muted">{c.note}</p> : null}
                  </TD>
                  <TD className="num">{c.kind === "percent" ? `${c.value}%` : `${filsToKwdString(c.value)} د.ك`}</TD>
                  <TD className="num text-sm">{c.min_order_fils ? `${filsToKwdString(c.min_order_fils)} د.ك` : "—"}</TD>
                  <TD className="text-sm">
                    <span className="num">{c.redemptions}</span>
                    {c.max_redemptions !== null ? (
                      <>
                        {" "}
                        / <span className="num">{c.max_redemptions}</span>
                      </>
                    ) : null}
                    <p className="text-xs text-muted">
                      <span className="num">{c.max_per_user}</span> لكل طالب
                    </p>
                  </TD>
                  <TD className="text-xs text-muted">
                    {c.starts_at ? formatDate(c.starts_at) : "الآن"} ← {c.ends_at ? formatDate(c.ends_at) : "بلا نهاية"}
                  </TD>
                  <TD>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button asChild size="icon" variant="ghost">
                        <Link href={`/admin/coupons/${c.id}`} aria-label={`تعديل ${c.code}`}>
                          <Pencil aria-hidden />
                        </Link>
                      </Button>
                      <QuickAction action={toggleCouponAction} hidden={{ id: c.id, active: c.is_active ? "0" : "1" }} label={c.is_active ? "إيقاف" : "تفعيل"} variant="ghost" />
                      <ConfirmButton action={deleteCouponAction} hidden={{ id: c.id }} label="" icon={<Trash2 aria-hidden />} size="icon" variant="ghost" title={`حذف الكوبون ${c.code}؟`} description="إذا استُخدم الكوبون في طلبات سابقة سيتم إيقافه بدل حذفه." confirmLabel="حذف" />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <Section title="إنشاء كوبون جديد">
        <CouponForm
          action={saveCouponAction}
          submitLabel="إنشاء الكوبون"
          defaults={{ code: "", kind: "percent", value: "", minOrder: "", maxRedemptions: "", maxPerUser: "1", startsAt: "", endsAt: "", isActive: true, note: "" }}
        />
      </Section>
    </div>
  );
}
