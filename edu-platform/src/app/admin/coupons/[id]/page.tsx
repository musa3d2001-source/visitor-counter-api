import { requireOwnerPage } from "@/server/auth/permissions";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getCoupon } from "@/server/admin/records";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { CouponForm } from "@/components/admin/coupon-form";
import { ar } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { CatalogBand } from "../../_components/catalog/band";
import { CouponTicket } from "../../_components/catalog/coupon-ticket";
import { saveCouponAction } from "../actions";
import { isUuid } from "@/lib/uuid";

export const metadata = { title: "تعديل كوبون" };

function day(d: Date | null) {
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(d)) : "";
}

function usedLabel(n: number) {
  if (n === 0) return "لم يُستخدم بعد";
  if (n === 1) return "استُخدم مرة واحدة";
  if (n === 2) return "استُخدم مرتين";
  const m = n % 100;
  return `استُخدم ${ar(n)} ${m >= 3 && m <= 10 ? "مرات" : "مرة"}`;
}

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await getCoupon(id);
  if (!c) notFound();
  return (
    <div className="max-w-5xl space-y-6">
      <CatalogBand
        tone="coral"
        art={
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rotate-[-4deg]">
            <CouponTicket as="div" c={{ ...c, note: null }} className="[--stub:5.5rem] sm:[--stub:5.5rem]" />
          </div>
        }
      >
        <AdminPageHeader className="mb-0 sm:mb-0" title={`الكوبون ${c.code}`} description={usedLabel(c.redemptions)} crumbs={[{ label: "الكوبونات", href: "/admin/coupons" }, { label: c.code }]}>
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-white">{c.max_redemptions !== null ? `الاستخدام ${ar(c.redemptions)} / ${ar(c.max_redemptions)}` : "بلا حد أقصى للاستخدام"}</span>
            {c.min_order_fils ? (
              <span className="chip chip-white">
                الحد الأدنى <span className="num">{filsToKwdString(c.min_order_fils)}</span> د.ك
              </span>
            ) : null}
            <span className="chip chip-white">
              {c.starts_at ? formatDate(c.starts_at) : "الآن"} ← {c.ends_at ? formatDate(c.ends_at) : "بلا نهاية"}
            </span>
          </div>
        </AdminPageHeader>
      </CatalogBand>
      <Section title="بيانات الكوبون" icon={<Pencil />} tone="coral">
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
