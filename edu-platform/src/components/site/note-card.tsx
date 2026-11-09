import Link from "next/link";
import type { ProductCard } from "@/server/catalog/queries";
import { SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { CompactPrice, Kicker, OwnedChip, SaleEndedChip, catalogStyles as s, contentChips, shortTerm } from "./card-parts";

/**
 * بطاقة المذكرة «الورقة المطوية» (v2-c NoteTile): ورقة بيضاء برأس بلون المادة (أيقونة + اسم المادة)،
 * أسطر وهمية، زاوية مطوية وأوراق خلفها. تحتها: الصف والفصل (طلب الحكّام: المذكرة تُظهر الصف)،
 * العنوان، عدد الصفحات، «أول الصفحات مجانًا» فقط إن وُجدت معاينة، والسعر.
 */
export function NoteCard({ product: p, owned, showGrade = true, headingLevel = 3 }: { product: ProductCard; owned?: boolean; showGrade?: boolean; headingLevel?: 2 | 3 | 4 }) {
  const H = `h${headingLevel}` as "h3";
  const meta = [showGrade ? p.gradeName : null, shortTerm(p.term)].filter(Boolean).join(" · ");
  const chips = contentChips(p, { free: true });
  return (
    <article data-testid="note-card" className={cn(s.ncard, toneClass(p.subjectSlug))}>
      <div className={s.nsheet} aria-hidden>
        <div className={s.nhead}>
          <span className={s.nicon}>
            <SubjectIcon slug={p.subjectSlug} size={20} />
          </span>
          <span className={s.nsub}>{p.subjectName ?? PRODUCT_TYPE_LABELS[p.type]}</span>
        </div>
        <div className={s.nlines}>
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className={s.nfold} />
      </div>
      <div className={s.nbody}>
        {meta ? <Kicker>{meta}</Kicker> : null}
        <H className={s.ntitle}>
          <Link href={`/products/${p.slug}`} className="stretched rounded-[18px]">
            {p.title}
          </Link>
        </H>
        {chips.length ? <p className={s.metaChips}>{chips}</p> : null}
        <div className={s.nfoot}>{owned ? <OwnedChip /> : p.saleEnded ? <SaleEndedChip /> : <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} />}</div>
      </div>
    </article>
  );
}
