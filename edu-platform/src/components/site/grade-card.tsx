import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GradeArt, SubjectIcon } from "@/components/art";
import { ar, count, gradeClass, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { catalogStyles as s } from "./card-parts";

export type GradeCardData = { slug: string; name: string; level: number };
export type GradeCardSubject = { id: string; slug: string; name: string };

/**
 * بطاقة الصف «الفصل المشمس» (v2-c): رابط ملموس بحافة سفلية بلون الصف، نافذة بتدرج الصف
 * ورقمه العربي البارز ورسمه، الاسم، أعداد حقيقية (المواد والمحتوى) إن مُرّرت، أيقونات المواد،
 * وشريط «ادخل صفك». اسم الصف في عنصر مستقل (يطابقه getByText بدقة).
 */
export function GradeCard({
  grade: g,
  stats,
  subjects,
  href,
  cta = "ادخل صفك",
  compact,
  className,
}: {
  grade: GradeCardData;
  /** أعداد حقيقية فقط (من الاستعلامات) */
  stats?: { subjects?: number; products?: number } | null;
  subjects?: GradeCardSubject[];
  href?: string;
  cta?: string;
  /** نافذة أقصر ورقم أصغر (شبكات ضيقة أو أربعة أعمدة على الجوال) */
  compact?: boolean;
  className?: string;
}) {
  const statLine = [stats?.subjects ? count(stats.subjects, W.subject) : null, stats?.products ? count(stats.products, W.product) : null].filter(Boolean).join(" · ");
  return (
    <Link href={href ?? `/grades/${g.slug}`} className={cn("tile-3d", s.gcard, compact && s.gcompact, gradeClass(g.level), className)}>
      <span className={s.gwin} aria-hidden>
        <span className={s.gnum}>{ar(g.level)}</span>
        <span className={s.gart}>
          <GradeArt level={g.level} />
        </span>
      </span>
      <span className={s.gbody}>
        <span className={s.gname}>{g.name}</span>
        {statLine ? <span className={s.gstats}>{statLine}</span> : null}
        {subjects?.length ? (
          <span className={s.gsubs} aria-hidden>
            {subjects.slice(0, 6).map((x) => (
              <span key={x.id} className={toneClass(x.slug)} title={x.name}>
                <SubjectIcon slug={x.slug} size={13} strokeWidth={2.6} />
              </span>
            ))}
          </span>
        ) : null}
        <span className={s.gcta}>
          {cta}
          <ArrowLeft aria-hidden />
        </span>
      </span>
    </Link>
  );
}

/** شبكة بطاقات الصفوف: عمودان على الجوال والأجهزة المتوسطة، وأربعة على الكبيرة. تمرر بقية خصائص ul (data-testid، aria-*) */
export function GradeGrid({ children, className, ...rest }: React.ComponentPropsWithoutRef<"ul">) {
  return (
    <ul {...rest} className={cn("grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4 lg:gap-6 [&>li]:min-w-0", className)}>
      {children}
    </ul>
  );
}
