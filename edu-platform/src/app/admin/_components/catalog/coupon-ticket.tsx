import type * as React from "react";
import { StatusPill, type StatusTone } from "@/components/admin/status-badge";
import { ar } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";

export type CouponLike = {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  note: string | null;
  is_active: boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  max_redemptions: number | null;
  redemptions: number;
};

/** حالة الكوبون المعروضة (نفس منطق الصفحة السابق) */
export function couponState(c: Pick<CouponLike, "is_active" | "starts_at" | "ends_at" | "max_redemptions" | "redemptions">): { label: string; tone: StatusTone; live: boolean } {
  const now = Date.now();
  if (!c.is_active) return { label: "موقوف", tone: "neutral", live: false };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "منتهي", tone: "danger", live: false };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "لم يبدأ", tone: "warning", live: false };
  if (c.max_redemptions !== null && c.redemptions >= c.max_redemptions) return { label: "استُنفد", tone: "danger", live: false };
  return { label: "فعّال", tone: "success", live: true };
}

/** قيمة الخصم كما تُعرض: «٢٠٪» أو «1.500 د.ك» (الأسعار بأرقام لاتينية) */
export function CouponValue({ kind, value, className }: { kind: "percent" | "fixed"; value: number; className?: string }) {
  return kind === "percent" ? (
    <span className={className}>{ar(value)}٪</span>
  ) : (
    <span className={className}>
      <span className="num">{filsToKwdString(value)}</span> <span className="text-[0.55em]">د.ك</span>
    </span>
  );
}

/**
 * تذكرة خصم مثقوبة: جسم أبيض فيه الكود والحالة والتفاصيل، وكعب ملوّن (مرجاني للفعّال، رمادي لغيره)
 * فيه قيمة الخصم. الثقبان قناع CSS فيظهران صحيحين على أي خلفية.
 */
export function CouponTicket({
  c,
  children,
  actions,
  className,
  as: As = "article",
}: {
  c: CouponLike;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  as?: "article" | "div";
}) {
  const st = couponState(c);
  return (
    <As className={cn("relative flex min-w-0 drop-shadow-[0_10px_18px_rgb(23_32_38/0.12)]", "[--notch:0.8rem] [--stub:6.5rem] sm:[--stub:7.5rem]", className)}>
      <div
        className={cn(
          "flex min-w-0 flex-1 overflow-hidden rounded-[1.4rem] bg-surface",
          "[mask:radial-gradient(circle_at_var(--stub)_0,#0000_var(--notch),#000_calc(var(--notch)+1px))_top/100%_51%_no-repeat,radial-gradient(circle_at_var(--stub)_100%,#0000_var(--notch),#000_calc(var(--notch)+1px))_bottom/100%_51%_no-repeat]",
        )}
      >
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[1.35rem] leading-tight font-black tracking-[0.08em] break-all text-ink" dir="ltr">
              {c.code}
            </span>
            <StatusPill tone={st.tone} pulse={st.live}>
              {st.label}
            </StatusPill>
          </div>
          {c.note ? <p className="mt-1 line-clamp-2 text-[0.82rem] leading-6 text-muted">{c.note}</p> : null}
          {children}
          {actions ? <div className="relative z-[2] mt-3 flex flex-wrap items-center gap-1 border-t border-dashed border-line pt-3">{actions}</div> : null}
        </div>
        <div
          className={cn(
            "relative grid w-[var(--stub)] shrink-0 place-items-center border-s-2 border-dashed border-white/50 px-2 text-center",
            st.live ? "bg-linear-to-b from-[#FFA07A] to-[#E8483F] text-white" : "bg-linear-to-b from-[#C5CFD5] to-[#7D8B94] text-white",
          )}
        >
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.22)_1.3px,transparent_1.7px)] bg-[length:14px_14px]" aria-hidden />
          <span className="relative">
            <span className="block font-display text-[0.72rem] font-bold text-white/85">خصم</span>
            <CouponValue kind={c.kind} value={c.value} className="block font-display text-[1.6rem] leading-tight font-black drop-shadow-[0_2px_4px_rgb(0_0_0/0.15)] sm:text-[1.85rem]" />
          </span>
        </div>
      </div>
    </As>
  );
}
