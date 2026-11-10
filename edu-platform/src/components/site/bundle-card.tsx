import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { BundleStack, SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { filsToKwdString } from "@/lib/money";
import { ar, countAcc, gradeClass, gradeLevelFromSlug, gradeTone, savings, subjectTone, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { CompactPrice, Kicker, OwnedChip, SaleEndedChip, catalogStyles as s } from "./card-parts";

/** ألوان أوراق الباقة: مواد محتوياتها الفعلية إن مُرّرت، وإلا ألوان الصف (دون ادعاء مواد) */
export function bundleColors(p: Pick<ProductCard, "gradeSlug">, items?: ProductCard[]): string[] {
  if (items?.length) return [...new Set(items.map((i) => subjectTone(i.subjectSlug).to))];
  const g = gradeTone(gradeLevelFromSlug(p.gradeSlug));
  return ["#ffffff", g.deep, g.to];
}

/** مواد الباقة الفعلية (بدون تكرار) لأيقوناتها الصغيرة */
function bundleSubjects(items?: ProductCard[]) {
  const seen = new Map<string, ProductCard>();
  for (const i of items ?? []) {
    const key = i.subjectSlug ?? i.subjectName ?? i.id;
    if (!seen.has(key)) seen.set(key, i);
  }
  return [...seen.values()];
}

function BundleArt({ p, items, level }: { p: ProductCard; items?: ProductCard[]; level: number | null }) {
  const save = savings(p.priceFils, p.compareAtPriceFils);
  return (
    <div className={s.bart} aria-hidden>
      {level != null ? <span className={s.bnum}>{ar(level)}</span> : null}
      <div className={s.bstack}>
        <BundleStack colors={bundleColors(p, items)} />
      </div>
      {save ? (
        <span className={s.ribbon}>
          وفّر <b className="num">{filsToKwdString(save.fils)}</b> د.ك
        </span>
      ) : null}
    </div>
  );
}

function ItemIcons({ items }: { items?: ProductCard[] }) {
  if (!items?.length) return null;
  const subs = bundleSubjects(items);
  return (
    <ul className={s.bitems} aria-label="تضم الباقة">
      {subs.slice(0, 6).map((i) => (
        <li key={i.id} className={toneClass(i.subjectSlug)} title={i.subjectName ?? i.title}>
          <SubjectIcon slug={i.subjectSlug} size={15} strokeWidth={2.4} />
          <span className="sr-only">{i.subjectName ?? i.title}</span>
        </li>
      ))}
      <li className={s.bcount}>{`تضم ${countAcc(items.length, W.product)}`}</li>
    </ul>
  );
}

/**
 * بطاقة الباقة (v2-c BundleTile): لوحة بتدرج الصف ورقمه الكبير، أوراق مروحية بألوان المواد التي تضمها
 * الباقة فعلًا (مرّر items)، ملصق «وفّر» ذهبي مائل فقط عند توفير حقيقي، المواد، والسعر مع الخصم.
 */
export function BundleCard({ product: p, items, owned, level, showGrade = true, headingLevel = 3 }: { product: ProductCard; items?: ProductCard[]; owned?: boolean; level?: number | null; showGrade?: boolean; headingLevel?: 2 | 3 | 4 }) {
  const H = `h${headingLevel}` as "h3";
  const lv = level !== undefined ? level : gradeLevelFromSlug(p.gradeSlug);
  return (
    <article data-testid="bundle-card" className={cn(s.cardBase, s.bcard, gradeClass(lv))}>
      <BundleArt p={p} items={items} level={lv} />
      <div className={s.bbody}>
        <Kicker>{[PRODUCT_TYPE_LABELS[p.type], showGrade ? p.gradeName : null].filter(Boolean).join(" · ")}</Kicker>
        <H className={s.btitle}>
          <Link prefetch={false} href={`/products/${p.slug}`} className="stretched rounded-[28px]">
            {p.title}
          </Link>
        </H>
        {items?.length ? <ItemIcons items={items} /> : p.summary ? <p className={s.bsummary}>{p.summary}</p> : null}
        <div className={s.bfoot}>{owned ? <OwnedChip /> : p.saleEnded ? <SaleEndedChip /> : <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} size="lg" />}</div>
      </div>
    </article>
  );
}

/**
 * الباقة العريضة (صفحة الباقات والقوائم): لوحة الصف بالأوراق المروحية بجانب العنوان والوصف والمواد،
 * والسعر مع التوفير الفعلي في كعب جانبي. data-testid="bundle-row".
 */
export function BundleWide({ product: p, items, owned, showGrade = true, headingLevel = 3 }: { product: ProductCard; items?: ProductCard[]; owned?: boolean; showGrade?: boolean; headingLevel?: 2 | 3 | 4 }) {
  const H = `h${headingLevel}` as "h3";
  const lv = gradeLevelFromSlug(p.gradeSlug);
  const save = savings(p.priceFils, p.compareAtPriceFils);
  return (
    <article data-testid="bundle-row" className={cn(s.cardBase, s.brow, gradeClass(lv))}>
      <BundleArt p={p} items={items} level={lv} />
      <div className={s.bbody}>
        <Kicker>{[PRODUCT_TYPE_LABELS[p.type], showGrade ? p.gradeName : null].filter(Boolean).join(" · ")}</Kicker>
        <H className={cn(s.btitle, s.btitleLg)}>
          <Link prefetch={false} href={`/products/${p.slug}`} className="stretched rounded-[28px]">
            {p.title}
          </Link>
        </H>
        {p.summary ? <p className={s.bsummary}>{p.summary}</p> : null}
        <ItemIcons items={items} />
      </div>
      <div className={s.browSide}>
        {owned ? (
          <OwnedChip />
        ) : p.saleEnded ? (
          <SaleEndedChip />
        ) : (
          <>
            <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} size="lg" />
            {save ? (
              <span className="font-display text-sm font-extrabold text-brand-800">
                توفّر <span className="num">{filsToKwdString(save.fils)}</span> د.ك
              </span>
            ) : null}
          </>
        )}
        <span className={cn(s.footBtn, s.footBtnQuiet)} aria-hidden>
          تفاصيل الباقة
          <ArrowLeft />
        </span>
      </div>
    </article>
  );
}
