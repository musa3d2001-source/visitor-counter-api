import type { ProductCard as ProductCardData } from "@/server/catalog/queries";
import { count, W } from "@/lib/design";
import { formatTotalDuration } from "./format";
import { cn } from "@/lib/utils";
import { CompactPrice, SaleEndedChip, catalogStyles as s, shortTerm } from "./card-parts";
import { ExamTicket, TICKET_TYPES } from "./exam-ticket";

/** سطر وصفي مختصر: المعلم، المدة/الدروس أو الصفحات، الفصل — بفواصل عربية */
export function productMeta(p: ProductCardData, opts: { teacher?: boolean; grade?: boolean } = {}): string {
  const parts: string[] = [];
  if (opts.teacher !== false && p.teacherName) parts.push(p.teacherName);
  if (opts.grade) parts.push(p.gradeName);
  if (p.isVideo && p.lessonCount) parts.push(`${count(p.lessonCount, W.lesson)}${p.totalDurationSeconds ? ` في ${formatTotalDuration(p.totalDurationSeconds)}` : ""}`);
  else if (p.pageCount) parts.push(count(p.pageCount, W.page));
  if (p.term) parts.push(shortTerm(p.term));
  return parts.join("، ");
}

/** السعر المضغوط للمنتج (مجانًا، أو السعر مع السعر قبل الخصم عند خصم حقيقي) */
export function PriceInline({ p, showPercent = false, className }: { p: ProductCardData; showPercent?: boolean; className?: string }) {
  if (p.saleEnded) return <SaleEndedChip className={className} />;
  return <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} showPercent={showPercent} className={className} />;
}

/**
 * صف القائمة الملون «تذكرة»: صورة مصغرة بلون المادة (ملصق فيديو بزر تشغيل، أو ورقة مذكرة، أو أوراق باقة)،
 * كبسولة النوع، العنوان (الرابط الرئيسي ممتد على الصف)، الصف والمعلم والفصل، كبسولات الدروس والمدة أو الصفحات،
 * وكعب السعر مع رابط «معاينة مجانية» المستقل. المراجعات (اختبار قصير وليلة الاختبار) بثقوب التذكرة.
 */
export function ProductRow({
  product: p,
  owned,
  showGrade,
  showTeacher = true,
  wide: _wide,
  items,
}: {
  product: ProductCardData;
  owned?: boolean;
  showGrade?: boolean;
  showTeacher?: boolean;
  wide?: boolean;
  /** محتويات الباقة (لتلوين أوراقها بمواد حقيقية) */
  items?: ProductCardData[];
}) {
  const meta = [showGrade ? p.gradeName : null, showTeacher ? p.teacherName : null, shortTerm(p.term) || null].filter(Boolean).join(" · ");
  return <ExamTicket product={p} owned={owned} meta={meta} notched={TICKET_TYPES.has(p.type)} items={items} />;
}

/** قائمة صفوف التذاكر الملونة: عمود واحد، أو عمودان على الشاشات الكبيرة */
export function ProductList({ products, ownedIds, columns = 1, showGrade, showTeacher, className }: { products: ProductCardData[]; ownedIds?: Set<string>; columns?: 1 | 2; showGrade?: boolean; showTeacher?: boolean; className?: string }) {
  return (
    <ul className={cn(s.list, columns === 2 && s.list2, className)}>
      {products.map((p) => (
        <li key={p.id}>
          <ProductRow product={p} owned={ownedIds?.has(p.id)} showGrade={showGrade} showTeacher={showTeacher} wide={columns === 1} />
        </li>
      ))}
    </ul>
  );
}
