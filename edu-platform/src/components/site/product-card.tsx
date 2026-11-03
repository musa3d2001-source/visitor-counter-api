import type { ProductCard as ProductCardData } from "@/server/catalog/queries";
import { isPdfType } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { catalogStyles as s } from "./card-parts";
import { VideoCard } from "./video-card";
import { NoteCard } from "./note-card";
import { BundleCard } from "./bundle-card";
import { ExamTicket } from "./exam-ticket";

export { productMeta, PriceInline, ProductRow, ProductList } from "./product-row";

export type ProductCardVariant = "auto" | "poster" | "note" | "bundle" | "ticket";

/** هل يُعرض المنتج كورقة مذكرة؟ (PDF بلا دروس مرئية) */
export function isNoteProduct(p: Pick<ProductCardData, "type" | "isVideo">) {
  return !p.isVideo && isPdfType(p.type);
}

/**
 * بطاقة المنتج «الفصل المشمس» — تختار الشكل حسب النوع (variant="auto"):
 *  - باقة ← BundleCard (أوراق مروحية بألوان موادها، ملصق التوفير الحقيقي)
 *  - مذكرة PDF ← NoteCard (ورقة مطوية برأس المادة والصف والصفحات)
 *  - غير ذلك ← VideoCard (ملصق متدرج، معاينة مجانية، المعلم، الدروس والمدة)
 * variant="ticket" ← ExamTicket (تذكرة مثقوبة أفقية).
 */
export function ProductCard({
  product: p,
  owned,
  variant = "auto",
  items,
  showGrade = true,
  headingLevel = 3,
}: {
  product: ProductCardData;
  owned?: boolean;
  variant?: ProductCardVariant;
  /** محتويات الباقة (لتلوين أوراقها وأيقوناتها بموادها الحقيقية) */
  items?: ProductCardData[];
  showGrade?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const v = variant === "auto" ? (p.type === "bundle" ? "bundle" : isNoteProduct(p) ? "note" : "poster") : variant;
  if (v === "bundle") return <BundleCard product={p} owned={owned} items={items} showGrade={showGrade} headingLevel={headingLevel} />;
  if (v === "note") return <NoteCard product={p} owned={owned} showGrade={showGrade} headingLevel={headingLevel} />;
  if (v === "ticket") return <ExamTicket product={p} owned={owned} items={items} headingLevel={headingLevel} />;
  // ‏ProductCard تعرضه الشبكات والقوائم العمودية؛ الرف الأفقي (.shelf) يعيد حجز السطرين في CSS
  return <VideoCard product={p} owned={owned} showGrade={showGrade} headingLevel={headingLevel} fitTitle />;
}

/**
 * شبكة بطاقات متجاوبة. إن كانت كل المنتجات مذكرات تصبح شبكة أوراق أضيق (عمودان على الجوال).
 * itemsById: محتويات الباقات (معرّف الباقة ← محتوياتها) لتلوين أوراقها.
 */
export function ProductGrid({
  products,
  ownedIds,
  variant = "auto",
  itemsById,
  showGrade,
  className,
}: {
  products: ProductCardData[];
  ownedIds?: Set<string>;
  variant?: ProductCardVariant;
  itemsById?: Map<string, ProductCardData[]>;
  showGrade?: boolean;
  className?: string;
}) {
  const notes = variant === "note" || (variant === "auto" && products.length > 0 && products.every(isNoteProduct));
  return (
    <ul className={cn(notes ? s.noteGrid : s.grid, className)}>
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} owned={ownedIds?.has(p.id)} variant={variant} items={itemsById?.get(p.id)} showGrade={showGrade} />
        </li>
      ))}
    </ul>
  );
}

/** رف أفقي قابل للسحب على الجوال (بطاقة بعرض ٨٠٪ مع إطلالة التالية)، وشبكة على الشاشات الأكبر */
export function ProductShelf({ products, ownedIds, variant = "auto", itemsById, showGrade, className }: { products: ProductCardData[]; ownedIds?: Set<string>; variant?: ProductCardVariant; itemsById?: Map<string, ProductCardData[]>; showGrade?: boolean; className?: string }) {
  return (
    <ul className={cn(s.shelf, className)}>
      {products.map((p) => (
        <li key={p.id}>
          <ProductCard product={p} owned={ownedIds?.has(p.id)} variant={variant} items={itemsById?.get(p.id)} showGrade={showGrade} />
        </li>
      ))}
    </ul>
  );
}
