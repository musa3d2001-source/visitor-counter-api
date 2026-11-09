import type * as React from "react";
import Link from "next/link";
import { CalendarClock, CircleCheck } from "lucide-react";
import { Price } from "@/components/ui/price";
import { AddToCart } from "@/components/site/add-to-cart";
import { Alert } from "@/components/ui/alert";
import { filsToKwdString } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";
import s from "./product.module.css";

export type TrustItem = { icon: React.ReactNode; text: React.ReactNode; bg: string; fg: string };

/**
 * لوح الشراء: رأس بلون المادة (النوع والصف)، السعر الكبير مع الخصم الحقيقي فقط، توفير الباقة الفعلي،
 * أزرار السلة (AddToCart) وزر المعاينة الذهبي، مدة الوصول (data-testid="access-period")، وضمانات صحيحة.
 */
/** يحل محل أزرار الشراء لمنتج انتهى تاريخ إتاحته */
export function SaleEndedNotice() {
  return (
    <div data-testid="sale-ended-notice">
      <Alert tone="warning">انتهت مدة إتاحة هذا المنتج، فلم يعد متاحًا للشراء.</Alert>
    </div>
  );
}

/**
 * يحل محل أزرار الشراء حين يكون الفيديو مغلقًا على المنصة. لا يَعد بموعد، لأن فتحه قرار لم يُتخذ بعد.
 * data-testid="video-closed-notice"
 */
export function VideoClosedNotice() {
  return (
    <div data-testid="video-closed-notice">
      <Alert tone="info">شراء دروس الفيديو غير متاح حاليًا.</Alert>
    </div>
  );
}

/**
 * يحل محل أزرار الشراء حين يتوقف بيع المنتج لسبب تعالجه الإدارة (ملف معيب، سعر أو نسبة لم تُحدد).
 * لا يذكر السبب للطالب ولا يعد بموعد. data-testid="product-unavailable-notice"
 */
export function ProductUnavailableNotice() {
  return (
    <div data-testid="product-unavailable-notice">
      <Alert tone="info">هذا المنتج غير متاح للشراء حاليًا.</Alert>
    </div>
  );
}

export function PurchasePanel({
  toneClass,
  typeIcon,
  typeLabel,
  gradeName,
  priceFils,
  compareAtPriceFils,
  bundleSaving,
  owned,
  buy,
  preview,
  accessText,
  trust,
  hidePrice = false,
}: {
  toneClass: string;
  typeIcon: React.ReactNode;
  typeLabel: string;
  gradeName: string;
  priceFils: number;
  compareAtPriceFils: number | null;
  /** الفرق الفعلي عن مجموع أسعار المحتويات (يُمرَّر فقط إن كان موجبًا) */
  bundleSaving?: { fils: number; label: string } | null;
  owned?: { until: Date | null; href: string; label: string; icon: React.ReactNode } | null;
  /** أزرار الشراء أو تنبيه (عند عدم الإتاحة) */
  buy?: React.ReactNode;
  preview?: { href: string; label: string; icon: React.ReactNode; testId?: string } | null;
  accessText: string;
  trust: TrustItem[];
  /** منتج لا يمكن شراؤه: سعر معروض بلا زر يوهم بأنه متاح، وقد يكون صفرًا لم يُعتمد */
  hidePrice?: boolean;
}) {
  return (
    <div className={cn("panel", s.buy, toneClass)}>
      <div className={s.buyTop}>
        <div className="flex items-center gap-3">
          <span className="icon-tile !size-11 !rounded-[0.9rem] [&_svg]:size-5">{typeIcon}</span>
          <div className="min-w-0 leading-snug">
            <p className="font-display text-[1.02rem] font-black text-[var(--tink)]">{typeLabel}</p>
            <p className="text-sm font-semibold text-ink-soft">{gradeName}</p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {owned ? (
          <>
            <p className="flex items-center gap-2.5 rounded-2xl bg-success-50 px-4 py-3 font-display font-extrabold text-success">
              <CircleCheck className="size-5 shrink-0" aria-hidden /> في مكتبتك
            </p>
            {owned.until ? <p className="mt-2 text-sm font-semibold text-ink-soft">متاح حتى {formatDate(owned.until)}</p> : null}
            <Link href={owned.href} className="btn btn-3d btn-primary btn-lg mt-4 w-full">
              {owned.icon}
              {owned.label}
            </Link>
          </>
        ) : (
          <>
            {hidePrice ? null : (
              <>
                <p className="font-display text-sm font-extrabold text-muted">السعر</p>
                <Price fils={priceFils} compareAt={compareAtPriceFils} size="xl" />
              </>
            )}
            {bundleSaving && !hidePrice ? (
              <p className="mt-2 inline-flex flex-wrap items-center gap-1 rounded-full bg-brand-50 px-3 py-1 font-display text-sm font-extrabold text-brand-800">
                توفّر <span className="num">{filsToKwdString(bundleSaving.fils)}</span> د.ك {bundleSaving.label}
              </p>
            ) : null}
            {buy ? <div className={hidePrice ? undefined : "mt-5"}>{buy}</div> : null}
          </>
        )}
        {preview ? (
          <Link href={preview.href} className="btn btn-3d btn-accent btn-lg mt-3 w-full" data-testid={preview.testId}>
            {preview.icon}
            {preview.label}
          </Link>
        ) : null}

        <div className={cn(s.access, "mt-5")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-100 text-accent-800">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <dl className="min-w-0 leading-snug">
            <dt className="text-xs font-bold text-muted">مدة الوصول</dt>
            <dd className="font-display font-extrabold text-ink" data-testid="access-period">
              {accessText}
            </dd>
          </dl>
        </div>

        {trust.length ? (
          <ul className={cn(s.trust, "mt-5")}>
            {trust.map((t, i) => (
              <li key={i}>
                <span className={s.trustIcon} style={{ background: t.bg, color: t.fg }}>
                  {t.icon}
                </span>
                <span className="pt-0.5">{t.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** شريط الشراء الثابت على الجوال: السعر ومدة الوصول وأزرار السلة */
export function MobileBuyBar({ productId, priceFils, compareAtPriceFils, accessText }: { productId: string; priceFils: number; compareAtPriceFils: number | null; accessText: string }) {
  return (
    <div className={cn(s.bar, "lg:hidden no-print")}>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_7rem]">
          <Price fils={priceFils} compareAt={compareAtPriceFils} size="md" showPercent={false} />
          <p className="truncate text-[0.75rem] font-semibold text-muted">{accessText}</p>
        </div>
        <AddToCart productId={productId} compact className="min-w-0 flex-[1_1_11.5rem]" />
      </div>
    </div>
  );
}
