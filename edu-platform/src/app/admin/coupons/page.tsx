import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { CalendarRange, Pencil, Receipt, Ticket, Trash2, UserRound, Users } from "lucide-react";
import { listCoupons } from "@/server/admin/records";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { CouponForm } from "@/components/admin/coupon-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, type CountWord } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { BandChip, BandChips, CatalogBand } from "../_components/catalog/band";
import { CouponArt } from "../_components/catalog/art";
import { CouponTicket, couponState } from "../_components/catalog/coupon-ticket";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "./actions";

export const metadata = { title: "الكوبونات" };

const COUPON_WORD: CountWord = {
  one: "كوبون",
  two: "كوبونان",
  plural: "كوبونات",
  acc: "كوبونًا",
};
const USE_WORD: CountWord = {
  one: "استخدام",
  two: "استخدامان",
  plural: "استخدامات",
  acc: "استخدامًا",
  none: "لم تُستخدم بعد",
};
const TIMES_WORD: CountWord = {
  one: "مرة",
  two: "مرتان",
  plural: "مرات",
  acc: "مرة",
  oneSuffix: "واحدة",
};

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const coupons = await listCoupons();
  const live = coupons.filter((c) => couponState(c).live).length;
  const uses = coupons.reduce((n, c) => n + c.redemptions, 0);
  const n = coupons.length;

  return (
    <div className="space-y-6">
      <CatalogBand
        tone="coral"
        art={<CouponArt />}
        footer={
          n ? (
            <BandChips>
              <BandChip tone="coral" icon={<Ticket />}>
                {count(n, COUPON_WORD)}
              </BandChip>
              <BandChip tone="green" icon={<Ticket />}>
                {live === 0 ? "لا يوجد كوبون فعّال" : `الفعّالة الآن: ${ar(live)}`}
              </BandChip>
              <BandChip tone="violet" icon={<Receipt />}>
                {count(uses, USE_WORD)}
              </BandChip>
            </BandChips>
          ) : null
        }
      >
        <AdminPageHeader className="mb-0 sm:mb-0" title="الكوبونات" description="أكواد خصم بسيطة بنسبة مئوية أو مبلغ ثابت. يُحسب الخصم دائمًا على الخادم." />
      </CatalogBand>
      {sp.created ? <Alert tone="success">تم إنشاء الكوبون.</Alert> : null}

      {coupons.length === 0 ? (
        <EmptyState art="receipt" title="لا توجد كوبونات بعد" description="أنشئ أول كود خصم من النموذج أدناه." />
      ) : (
        <ul className="grid gap-5 xl:grid-cols-2">
          {coupons.map((c) => {
            const pct = c.max_redemptions ? Math.min(100, Math.round((c.redemptions / c.max_redemptions) * 100)) : null;
            return (
              <li key={c.id} className="min-w-0">
                <CouponTicket
                  c={c}
                  actions={
                    <>
                      <Button asChild size="sm" variant="soft">
                        <Link href={`/admin/coupons/${c.id}`} aria-label={`تعديل ${c.code}`}>
                          <Pencil aria-hidden /> تعديل
                        </Link>
                      </Button>
                      <QuickAction action={toggleCouponAction} hidden={{ id: c.id, active: c.is_active ? "0" : "1" }} label={c.is_active ? "إيقاف" : "تفعيل"} variant="ghost" />
                      <span className="ms-auto">
                        <ConfirmButton
                          action={deleteCouponAction}
                          hidden={{ id: c.id }}
                          label=""
                          icon={<Trash2 aria-hidden />}
                          size="icon"
                          variant="ghost"
                          title={`حذف الكوبون ${c.code}؟`}
                          description="إذا استُخدم الكوبون في طلبات سابقة سيتم إيقافه بدل حذفه."
                          confirmLabel="حذف"
                        />
                      </span>
                    </>
                  }
                >
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[0.82rem]">
                    <div className="col-span-2">
                      <dt className="flex items-center gap-1.5 font-display font-bold text-muted">
                        <Users className="size-3.5" aria-hidden /> الاستخدام
                      </dt>
                      <dd className="mt-1">
                        <span className="font-display font-extrabold text-ink">
                          {ar(c.redemptions)}
                          {c.max_redemptions !== null ? ` / ${ar(c.max_redemptions)}` : ""}
                        </span>{" "}
                        <span className="text-muted">{c.max_redemptions !== null ? "من الحد الأقصى" : "بلا حد أقصى"}</span>
                        {pct !== null ? (
                          <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-mist" aria-hidden>
                            <span className="block h-full rounded-full bg-linear-to-l from-[#FFA07A] to-[#E8483F]" style={{ width: `${pct}%` }} />
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 font-display font-bold text-muted">
                        <UserRound className="size-3.5" aria-hidden /> لكل طالب
                      </dt>
                      <dd className="font-medium text-ink-soft">{count(c.max_per_user, TIMES_WORD)}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 font-display font-bold text-muted">
                        <Receipt className="size-3.5" aria-hidden /> الحد الأدنى
                      </dt>
                      <dd className="font-medium text-ink-soft">{c.min_order_fils ? <span className="num">{filsToKwdString(c.min_order_fils)} د.ك</span> : "بدون حد أدنى"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="flex items-center gap-1.5 font-display font-bold text-muted">
                        <CalendarRange className="size-3.5" aria-hidden /> الفترة
                      </dt>
                      <dd className="font-medium text-ink-soft">
                        {c.starts_at ? formatDate(c.starts_at) : "الآن"} ← {c.ends_at ? formatDate(c.ends_at) : "بلا نهاية"}
                      </dd>
                    </div>
                  </dl>
                </CouponTicket>
              </li>
            );
          })}
        </ul>
      )}

      <Section title="إنشاء كوبون جديد" icon={<Ticket />} tone="coral" description="اختر كودًا سهل التذكر، ثم حدّد قيمة الخصم وحدوده وفترته.">
        <CouponForm
          action={saveCouponAction}
          submitLabel="إنشاء الكوبون"
          defaults={{
            code: "",
            kind: "percent",
            value: "",
            minOrder: "",
            maxRedemptions: "",
            maxPerUser: "1",
            startsAt: "",
            endsAt: "",
            isActive: true,
            note: "",
          }}
        />
      </Section>
    </div>
  );
}
