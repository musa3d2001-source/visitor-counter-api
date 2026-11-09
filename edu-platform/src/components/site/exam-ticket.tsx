import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { Play, Sparkles } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { BundleStack, SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS, isPdfType } from "@/lib/labels";
import { gradeClass, gradeLevelFromSlug, toneClass } from "@/lib/design";
import { bundleColors } from "./bundle-card";
import { cn } from "@/lib/utils";
import { CompactPrice, OwnedChip, SaleEndedChip, catalogStyles as s, contentChips, previewHref } from "./card-parts";

/** المراجعات تأخذ شكل التذكرة المثقوبة */
export const TICKET_TYPES = new Set<string>(["exam_review", "quiz_review"]);

/** الصورة المصغرة الملونة: مذكرة مطوية، أو أوراق باقة، أو أيقونة المادة مع زر تشغيل للفيديو */
export function ProductThumb({ product: p, className, items }: { product: ProductCard; className?: string; items?: ProductCard[] }) {
  if (p.coverUrl) {
    return (
      <span className={cn(s.tthumb, className)} aria-hidden>
        <Image src={p.coverUrl} alt="" fill sizes="76px" className={s.tthumbImg} />
        {p.isVideo ? (
          <span className={s.tthumbPlay}>
            <Play fill="currentColor" />
          </span>
        ) : null}
      </span>
    );
  }
  if (p.type === "bundle") {
    const colors = bundleColors(p, items);
    return (
      <span className={cn(s.tthumb, s.tthumbStack, gradeClass(gradeLevelFromSlug(p.gradeSlug)), className)} aria-hidden>
        <BundleStack colors={colors} />
      </span>
    );
  }
  if (!p.isVideo && isPdfType(p.type)) {
    return (
      <span className={cn(s.tthumb, s.tthumbNote, className)} aria-hidden>
        <span className={s.miniSheet}>
          <b>
            <SubjectIcon slug={p.subjectSlug} size={13} strokeWidth={2.6} />
          </b>
          <i />
          <i />
        </span>
      </span>
    );
  }
  return (
    <span className={cn(s.tthumb, className)} aria-hidden>
      <SubjectIcon slug={p.subjectSlug} size={30} strokeWidth={2.2} />
      {p.isVideo ? (
        <span className={s.tthumbPlay}>
          <Play fill="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * تذكرة «الفصل المشمس» (v2-c ExamTicket): بطاقة بيضاء، صورة مصغرة بلون المادة، العنوان والسطر الوصفي
 * والكبسولات، وكعب مفصول بخط متقطع فيه السعر ورابط المعاينة. notched: ثقبان دائريان عند الخط المتقطع.
 * هي أساس صف القوائم ProductRow أيضًا.
 */
export function ExamTicket({
  product: p,
  owned,
  meta,
  tag,
  notched = true,
  headingLevel = 3,
  items,
  className,
  testId,
}: {
  product: ProductCard;
  owned?: boolean;
  /** سطر وصفي تحت العنوان (افتراضيًا: الصف · المعلم) */
  meta?: string;
  /** كبسولة النوع فوق العنوان (افتراضيًا اسم النوع) — مرّر null لإخفائها */
  tag?: string | null;
  notched?: boolean;
  headingLevel?: 2 | 3 | 4;
  items?: ProductCard[];
  className?: string;
  testId?: string;
}) {
  const titleId = useId();
  const H = `h${headingLevel}` as "h3";
  const preview = !owned ? previewHref(p) : null;
  const chips = contentChips(p, { free: true });
  const line = meta ?? [p.gradeName, p.teacherName].filter(Boolean).join(" · ");
  const tagText = tag === undefined ? PRODUCT_TYPE_LABELS[p.type] : tag;
  return (
    <article data-testid={testId ?? (p.isVideo ? "video-card" : "product-row")} className={cn(s.trow, notched && s.notched, toneClass(p.subjectSlug), className)}>
      <div className={s.tbox}>
        <ProductThumb product={p} items={items} />
        <div className={s.ttext}>
          {tagText ? (
            <p className={s.ttag}>
              <span className={cn(s.metaChip, s.metaChipTone)}>{tagText}</span>
            </p>
          ) : null}
          <H className={s.ttitle}>
            <Link href={`/products/${p.slug}`} id={titleId} className="stretched rounded-[22px]">
              {p.title}
            </Link>
          </H>
          {line ? <p className={s.tmeta}>{line}</p> : null}
          {chips.length ? <p className={s.metaChips}>{chips}</p> : null}
        </div>
        <div className={s.tstub}>
          {owned ? <OwnedChip /> : p.saleEnded ? <SaleEndedChip /> : <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} />}
          {preview ? (
            <Link href={preview} className={cn(s.footBtn, s.footBtnGold)} aria-describedby={titleId}>
              <Sparkles aria-hidden />
              معاينة مجانية
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
