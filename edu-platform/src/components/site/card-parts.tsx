/**
 * أجزاء مشتركة لبطاقات الكتالوج «الفصل المشمس»: السعر المضغوط، «في مكتبتك»، سطر المادة والصف،
 * كبسولات الدروس والمدة والصفحات، رابط المعاينة، واستنتاج مفتاح المادة من اسمها.
 * كل القيم من بيانات حقيقية (ProductCard)؛ لا أرقام مخترعة.
 */
import type * as React from "react";
import { CircleCheck, Clock3, FileText, PlayCircle, Sparkles } from "lucide-react";
import type { ProductCard as ProductCardData } from "@/server/catalog/queries";
import { termLabel } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, count, duration, savings, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./catalog.module.css";

export { s as catalogStyles };

/** مفتاح المادة من اسمها العربي (للأماكن التي لا يصلها subjectSlug مثل السلة والمكتبة) */
export function subjectSlugFromName(name: string | null | undefined): string | null {
  const n = name ?? "";
  if (/عرب/u.test(n)) return "arabic";
  if (/إنجليز|انجليز|English/iu.test(n)) return "english";
  if (/رياض/u.test(n)) return "math";
  if (/علوم/u.test(n)) return "science";
  if (/إسلام|اسلام/u.test(n)) return "islamic";
  if (/اجتماع/u.test(n)) return "social";
  return null;
}

/** رابط المعاينة المجانية للفيديو (أول درس مجاني جاهز) أو null */
export function previewHref(p: Pick<ProductCardData, "id" | "previewLessonId">): string | null {
  return p.previewLessonId ? `/watch/${p.id}?lesson=${p.previewLessonId}` : null;
}

/** «الفصل الأول» بدل «الفصل الدراسي الأول» */
export function shortTerm(term: number | null): string {
  return term ? termLabel(term).replace("الفصل الدراسي ", "الفصل ") : "";
}

/** سعر مضغوط: رقم Cairo لاتيني + «د.ك»، والسعر قبل الخصم مشطوبًا وكبسولة «خصم ٢٠٪» عند خصم حقيقي فقط */
export function CompactPrice({ fils, compareAt, size = "md", showPercent = true, className }: { fils: number; compareAt?: number | null; size?: "md" | "lg"; showPercent?: boolean; className?: string }) {
  const save = savings(fils, compareAt);
  return (
    <span className={cn(s.price, size === "lg" && s.priceLg, className)}>
      {fils === 0 ? (
        <span className={cn(s.priceNow, s.priceFree)}>مجانًا</span>
      ) : (
        <span className={s.priceNow}>
          <span className="num">{filsToKwdString(fils)}</span> <span className={s.cur}>د.ك</span>
        </span>
      )}
      {save ? (
        <>
          <s className={s.priceWas}>
            <span className="sr-only">السعر قبل الخصم </span>
            <span className="num">{filsToKwdString(compareAt!)}</span>
          </s>
          {showPercent ? <span className={s.pct}>خصم {ar(save.pct)}٪</span> : null}
        </>
      ) : null}
    </span>
  );
}

export function OwnedChip({ className }: { className?: string }) {
  return (
    <span className={cn(s.owned, className)}>
      <CircleCheck aria-hidden />
      في مكتبتك
    </span>
  );
}

/** «● الرياضيات · الصف التاسع» بلون المادة */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn(s.kicker, className)}>
      <span className={s.kdot} aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** كبسولات المحتوى الحقيقية: الدروس والمدة للفيديو، أو الصفحات للمذكرة */
export function contentChips(p: ProductCardData, opts: { free?: boolean } = {}): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  if (p.isVideo && p.lessonCount > 0) {
    out.push(
      <span key="l" className={s.metaChip}>
        <PlayCircle aria-hidden />
        {count(p.lessonCount, W.lesson)}
      </span>,
    );
    if (p.totalDurationSeconds > 0)
      out.push(
        <span key="d" className={s.metaChip}>
          <Clock3 aria-hidden />
          {duration(p.totalDurationSeconds)}
        </span>,
      );
  } else if (p.pageCount) {
    out.push(
      <span key="p" className={s.metaChip}>
        <FileText aria-hidden />
        {count(p.pageCount, W.page)}
      </span>,
    );
  }
  if (opts.free && !p.isVideo && p.hasPreview)
    out.push(
      <span key="f" className={cn(s.metaChip, s.metaChipFree)}>
        <Sparkles aria-hidden />
        أول الصفحات مجانًا
      </span>,
    );
  return out;
}
