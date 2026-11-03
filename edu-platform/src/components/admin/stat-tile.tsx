import Link from "next/link";
import { ArrowDownLeft, ArrowUpLeft, Minus } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { ToneIcon } from "./icon-tile";
import { STRETCHED_FOCUS, toneStyle, type AdminTone } from "./tones";

/**
 * لون تلقائي للبطاقة حين لا يُمرَّر tone: يُستنتج من معنى التسمية حتى يبقى المعنى نفسه بلون واحد
 * في كل الصفحات (المال ذهبي، الطلبات أخضر، الطلاب بنفسجي، المحتوى أزرق، المراجعة مرجاني...).
 */
const AUTO: [RegExp, AdminTone][] = [
  [/مراجعة|مسترد|استرد|مرفوض|فشل/, "coral"],
  [/خصوم|كوبون/, "pink"],
  [/مبيعات|إيراد|أرباح|رصيد|مستحق|مبلغ|قيمة|صافي|عمولة|مسدد|خصم|د\.ك/, "gold"],
  [/طلب|مدفوع|عملي/, "green"],
  [/طالب|طلاب|مشتر|حساب/, "violet"],
  [/معلم/, "pink"],
  [/مسود|مخفي|مؤرشف/, "slate"],
  [/منشور|منتج|محتوى|درس|ملف|مذكر|باق|فيديو/, "sky"],
];
export function autoTone(label: string): AdminTone {
  return AUTO.find(([re]) => re.test(label))?.[1] ?? "teal";
}

export type StatDelta = {
  /** نص التغيّر كما هو (مثل «+٣ هذا الأسبوع»). أرقام حقيقية فقط. */
  value: React.ReactNode;
  trend?: "up" | "down" | "flat";
  /** هل الصعود جيد؟ (افتراضي نعم) — يحدد اللون الأخضر/الأحمر */
  upIsGood?: boolean;
};

/**
 * بطاقة رقم ملخّص «الفصل المشمس»: مربع أيقونة ملوّن، تسمية، رقم Cairo كبير، تلميح، وتغيّر اختياري.
 * - tone: اختياري، وإلا يُستنتج من التسمية (autoTone).
 * - href: يجعل البطاقة كلها رابطًا (رفع عند المرور).
 * - value: ضع الأرقام داخل <span className="num"> ؛ الأسعار بأرقام لاتينية، العدّ بـ ar()/count().
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
  delta,
  href,
  className,
  ...rest
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: AdminTone;
  delta?: StatDelta;
  href?: string;
  className?: string;
} & Omit<React.ComponentProps<"div">, "children">) {
  const t = tone ?? autoTone(label);
  const good = delta ? (delta.trend === "flat" ? null : (delta.trend === "up") === (delta.upIsGood ?? true)) : null;
  const TrendIcon = delta?.trend === "up" ? ArrowUpLeft : delta?.trend === "down" ? ArrowDownLeft : Minus;
  return (
    <div
      style={toneStyle(t)}
      className={cn(
        "group relative isolate flex min-w-0 flex-col overflow-hidden rounded-[1.6rem] border-2 border-[color-mix(in_oklab,var(--d)_10%,white)] bg-surface p-4 sm:p-5",
        "shadow-[0_5px_0_color-mix(in_oklab,var(--d)_24%,white),0_20px_34px_-24px_color-mix(in_oklab,var(--d)_70%,transparent)]",
        href && ["lift", STRETCHED_FOCUS],
        className,
      )}
      {...rest}
    >
      {/* هالة ملوّنة زخرفية في الزاوية */}
      <span className="pointer-events-none absolute -end-12 -top-14 -z-10 size-36 rounded-full bg-[var(--soft)]" aria-hidden />
      <span
        className="pointer-events-none absolute -end-6 -top-8 -z-10 size-24 rounded-full border-[10px] border-white/70 opacity-80"
        aria-hidden
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        {icon ? (
          <ToneIcon tone={t} size="md">
            {icon}
          </ToneIcon>
        ) : (
          <span className="mt-1 h-2 w-10 rounded-full bg-linear-to-l from-[var(--a)] to-[var(--b)]" aria-hidden />
        )}
        {delta ? (
          <span
            className={cn(
              "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 font-display text-[0.78rem] font-extrabold whitespace-nowrap",
              good === null ? "bg-mist text-ink-soft" : good ? "bg-success-50 text-success" : "bg-danger-50 text-danger",
            )}
          >
            <TrendIcon className="size-3.5" aria-hidden />
            {delta.value}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-[0.9rem] leading-snug font-bold text-ink-soft">
        {href ? (
          <Link href={href} className="stretched hover:text-[var(--tink)]">
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <div className="mt-1 font-display text-[clamp(1.55rem,2.6vw,2.15rem)] leading-[1.2] font-black tracking-tight text-ink [&_.text-muted]:font-bold [&_.text-sm]:text-[0.9rem]">
        {value}
      </div>
      {hint ? <p className="mt-1.5 text-[0.8rem] leading-6 font-medium text-[var(--tink)]">{hint}</p> : null}
    </div>
  );
}

/** الاسم القديم (متوافق مع الصفحات الحالية) */
export const StatCard = StatTile;

/** شبكة بطاقات الأرقام: عمودان على الجوال، ٣ أو ٤ على الحاسوب */
export function StatGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        cols === 4 && "lg:grid-cols-4",
        cols === 3 && "lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** رقم صغير داخل لوح (صف من الأرقام الثانوية): نقطة ملوّنة + تسمية + قيمة */
export function MiniStat({ label, value, tone, className }: { label: string; value: React.ReactNode; tone?: AdminTone; className?: string }) {
  const t = tone ?? autoTone(label);
  return (
    <div style={toneStyle(t)} className={cn("min-w-0 rounded-2xl bg-[var(--soft)] px-4 py-3", className)}>
      <p className="flex items-center gap-1.5 font-display text-[0.8rem] font-bold text-[var(--tink)]">
        <span className="size-2 rounded-full bg-[var(--b)]" aria-hidden />
        {label}
      </p>
      <div className="mt-0.5 font-display text-[1.35rem] leading-tight font-black text-ink">{value}</div>
    </div>
  );
}
