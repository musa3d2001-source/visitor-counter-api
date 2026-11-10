/**
 * أجزاء صفحات الشراء «الفصل المشمس» (السلة، إتمام الشراء، الطلب، المكتبة، الحساب).
 * كلها عرض فقط: لا منطق ولا استعلامات. الأرقام من بيانات حقيقية تمرَّر إليها.
 */
import type * as React from "react";
import { BadgeCheck, BadgePercent, MonitorSmartphone, ShieldCheck, Zap } from "lucide-react";
import { Sparkle, SpotArt, type SpotKind } from "@/components/art";
import { ProductCover } from "@/components/site/product-cover";
import { GradeCard, GradeGrid } from "@/components/site/grade-card";
import { countParts, type CountWord } from "@/lib/design";
import type { ProductType } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { libraryNote, paymentClaims, type PaymentPublicState } from "@/lib/site-truth";
import { cn } from "@/lib/utils";

export type PosterItem = {
  key: string;
  title: string;
  type: ProductType;
  subjectName: string | null;
  subjectSlug?: string | null;
  gradeName: string;
  coverUrl: string | null;
};

const TILTS = [
  "z-10 end-[34%] top-[8%] -rotate-[9deg]",
  "z-20 end-[8%] top-[0%] rotate-[5deg]",
  "z-0 end-[56%] top-[18%] -rotate-[16deg]",
];

/**
 * ملصقات مائلة ملونة (مثل بطاقات بطل الصفحة الرئيسية) من عناصر حقيقية: السلة أو المكتبة.
 * زخرفية بالكامل (aria-hidden)؛ coin اختياري لرقم حقيقي (مثل المجموع).
 */
export function TiltedPosters({ items, coin, className }: { items: PosterItem[]; coin?: { label: string; value: string; unit?: string }; className?: string }) {
  const shown = items.slice(0, 3);
  return (
    <div className={cn("relative mx-auto h-[19rem] w-full max-w-[30rem]", className)} aria-hidden>
      <div className="absolute inset-x-[12%] top-[8%] bottom-[2%] rounded-full bg-[radial-gradient(closest-side,rgb(255_197_49/0.45),transparent)]" />
      <Sparkle className="animate-twinkle absolute start-[2%] top-[6%] size-7" />
      <Sparkle className="animate-twinkle absolute end-[2%] bottom-[10%] size-4 [animation-delay:1.1s]" color="#18B9A7" />
      <span className="absolute start-[4%] bottom-[4%] h-16 w-24 dot-grid opacity-60" />
      {shown.map((it, i) => (
        <div
          key={it.key}
          className={cn(
            "absolute w-[11.5rem] rounded-[1.4rem] bg-white p-1.5 shadow-lift transition-transform duration-300",
            shown.length === 1 ? "end-[28%] top-[4%] -rotate-[6deg] z-10" : TILTS[i],
          )}
        >
          <ProductCover coverUrl={it.coverUrl} title={it.title} type={it.type} subjectName={it.subjectName} subjectSlug={it.subjectSlug} gradeName={it.gradeName} sizes="184px" className="rounded-[1.1rem]" />
        </div>
      ))}
      {coin ? (
        <div className="absolute start-[6%] top-[46%] z-30 grid size-28 rotate-[-8deg] place-items-center rounded-full border-4 border-dashed border-white/70 bg-[radial-gradient(circle_at_30%_25%,#ffe08a,#ffc531_55%,#eb9b00)] text-center text-accent-900 shadow-[0_10px_0_#d48c00,0_24px_40px_-16px_rgb(120_70_0/0.6)]">
          <span className="leading-tight">
            <span className="block font-display text-[0.8rem] font-extrabold">{coin.label}</span>
            <span className="num block font-display text-[1.45rem] font-black">{coin.value}</span>
            {coin.unit ? <span className="block font-display text-[0.75rem] font-extrabold">{coin.unit}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** سعر بأرقام لاتينية وCairo ثقيل + «د.ك» */
export function Kwd({ fils, className, unitClassName }: { fils: number; className?: string; unitClassName?: string }) {
  return (
    <span className={cn("font-display font-black whitespace-nowrap", className)}>
      <span className="num">{filsToKwdString(fils)}</span> <span className={cn("text-[0.7em] font-extrabold text-muted", unitClassName)}>د.ك</span>
    </span>
  );
}

/** شارة توفير حقيقي (فقط حين يكون السعر قبل الخصم أعلى): «وفّرت 1.000 د.ك» */
export function SavedChip({ fils, className }: { fils: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-0.5 font-display text-[0.8rem] font-extrabold text-success", className)}>
      <BadgePercent className="size-3.5" aria-hidden />
      وفّرت <span className="num">{filsToKwdString(fils)}</span> د.ك
    </span>
  );
}

/** صف في ملخص المبالغ */
export function SumRow({ label, children, tone, className }: { label: React.ReactNode; children: React.ReactNode; tone?: "success" | "muted"; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-[0.95rem]", tone === "success" && "text-success", className)}>
      <dt className={cn(tone === "success" ? "font-bold" : "text-ink-soft")}>{label}</dt>
      <dd className="font-display font-extrabold">{children}</dd>
    </div>
  );
}

/** ميزات حقيقية للدفع والوصول، تتبع حال الدفع الفعلية */
export function TrustList({ payment, className }: { payment: PaymentPublicState; className?: string }) {
  const claims = paymentClaims(payment);
  const perk = libraryNote(payment, "cartPerk");
  const rows = [
    ...(claims.cartLine ? [{ icon: <ShieldCheck />, text: claims.cartLine, cls: "from-[#2dc2b3] to-[#0a6b66] text-white" }] : []),
    ...(perk ? [{ icon: <Zap />, text: perk, cls: "from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]" }] : []),
    { icon: <MonitorSmartphone />, text: "يفتح على الجوال والحاسوب", cls: "from-[#b28cff] to-[#6a3fe0] text-white" },
  ];
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <li key={r.text} className="flex items-center gap-3 text-[0.92rem] font-semibold text-ink-soft">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-[0.7rem] bg-linear-to-br [&_svg]:size-4", r.cls)} aria-hidden>
            {r.icon}
          </span>
          {r.text}
        </li>
      ))}
    </ul>
  );
}

/** شارة صغيرة «محتوى في مكتبتك» داخل صفوف السلة */
export function OwnedNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 font-display text-[0.85rem] font-extrabold text-success">
      <BadgeCheck className="size-4" aria-hidden />
      {children}
    </span>
  );
}

/** شريط تقدم بلون المادة (أو ذهبي على الأسطح الداكنة) */
export function ProgressBar({ pct, tone = "subject", className }: { pct: number; tone?: "subject" | "gold"; className?: string }) {
  return (
    <span className={cn("block h-2.5 overflow-hidden rounded-full", tone === "gold" ? "bg-white/18" : "bg-[var(--soft,var(--color-mist))]", className)}>
      <span
        className={cn("block h-full rounded-full", tone === "gold" ? "bg-linear-to-l from-[#ffe08a] to-[#ffb020]" : "bg-linear-to-l from-[var(--a,var(--brand-hi))] to-[var(--b,var(--brand))]")}
        style={{ width: `${Math.max(pct > 0 ? 6 : 0, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/**
 * أجزاء رقم StatPill بعربية سليمة: ١ ← «منتج واحد»، ٢ ← «منتجان» (بلا رقم مكرر)، ٣+ ← رقم ومعدود.
 */
export function pillParts(n: number, w: CountWord): { num: string; label: string } {
  return countParts(n, w);
}

/**
 * حالة فارغة غنية: لوح أبيض بشريط قوس قزح، رسم، عنوان h2، وصف، أزرار، ثم بطاقات الصفوف الحقيقية للبدء.
 */
export function EmptyStart({
  art,
  title,
  description,
  actions,
  grades,
  gradesTitle = "ابدأ من صفك",
}: {
  art: SpotKind;
  title: string;
  description: string;
  actions?: React.ReactNode;
  grades: { slug: string; name: string; level: number }[];
  gradesTitle?: string;
}) {
  return (
    <section className="panel panel-rainbow overflow-hidden px-5 pt-10 pb-8 sm:px-10 sm:pt-12 sm:pb-10" aria-labelledby="empty-title">
      <div className={cn("bg-sunny relative isolate -mx-5 -mt-10 flex flex-col items-center px-5 pt-10 pb-9 text-center sm:-mx-10 sm:-mt-12 sm:px-10 sm:pt-12", grades.length ? "mb-8" : "-mb-8 sm:-mb-10")}>
        <Sparkle className="animate-twinkle absolute start-[12%] top-10 size-6" />
        <Sparkle className="animate-twinkle absolute end-[14%] bottom-10 size-4 [animation-delay:1.2s]" color="#18B9A7" />
        <div className="h-32 w-36 text-brand-600 sm:h-36 sm:w-40" aria-hidden>
          <SpotArt kind={art} />
        </div>
        <h2 id="empty-title" className="mt-2 font-display text-[1.75rem] leading-snug font-black text-ink sm:text-[2rem]">
          {title}
        </h2>
        <p className="mt-2 max-w-md text-[1.02rem] leading-8 text-ink-soft">{description}</p>
        {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      </div>
      {grades.length ? (
        <>
          <h3 className="mb-5 font-display text-[1.3rem] font-black text-ink">{gradesTitle}</h3>
          <GradeGrid>
            {grades.map((g) => (
              <li key={g.slug}>
                <GradeCard grade={g} compact />
              </li>
            ))}
          </GradeGrid>
        </>
      ) : null}
    </section>
  );
}
