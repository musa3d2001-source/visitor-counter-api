import { requireOwnerPage } from "@/server/auth/permissions";
import { notFound } from "next/navigation";
import { getCoupon } from "@/server/admin/records";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { CouponForm } from "@/components/admin/coupon-form";
import { filsToKwdString } from "@/lib/money";
import { saveCouponAction } from "../actions";

export const metadata = { title: "تعديل كوبون" };

function day(d: Date | null) {
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(d)) : "";
}

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getCoupon(id);
  if (!c) notFound();
  return (
    <div className="max-w-5xl">
      <AdminPageHeader
        title={`الكوبون ${c.code}`}
        description={`استُخدم ${c.redemptions} مرة`}
        crumbs={[{ label: "الكوبونات", href: "/admin/coupons" }, { label: c.code }]}
      />
      <Section title="بيانات الكوبون">
        <CouponForm
          action={saveCouponAction}
          submitLabel="حفظ التعديلات"
          defaults={{
            id: c.id,
            code: c.code,
            kind: c.kind,
            value: c.kind === "percent" ? String(c.value) : filsToKwdString(c.value),
            minOrder: c.min_order_fils ? filsToKwdString(c.min_order_fils) : "",
            maxRedemptions: c.max_redemptions ? String(c.max_redemptions) : "",
            maxPerUser: String(c.max_per_user),
            startsAt: day(c.starts_at),
            endsAt: day(c.ends_at),
            isActive: c.is_active,
            note: c.note,
          }}
        />
      </Section>
    </div>
  );
}
