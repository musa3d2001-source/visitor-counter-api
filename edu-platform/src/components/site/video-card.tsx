import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { ArrowLeft, Play, Sparkles } from "lucide-react";
import type { ProductCard } from "@/server/catalog/queries";
import { SubjectArt } from "@/components/art";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { CompactPrice, Kicker, OwnedChip, SaleEndedChip, catalogStyles as s, contentChips, previewHref } from "./card-parts";
import { TeacherAvatar } from "./teacher-avatar";
import { ProductList } from "./product-row";

/**
 * بطاقة الملصق «الفصل المشمس» (v2-c VideoCard):
 * ملصق بتدرج المادة + رسمها + نقاط، كبسولة النوع، «معاينة مجانية» الذهبية عند وجود درس مجاني فعلي،
 * صورة المعلم (أو حرفه) متداخلة، «المادة · الصف»، العنوان، المعلم، الدروس والمدة، السعر والخصم الحقيقي،
 * وزر التذييل: «شاهد مجانًا» رابط مستقل للمعاينة، وإلا «التفاصيل».
 * البطاقة كلها قابلة للنقر برابط ممتد (حلقة التركيز على البطاقة)، وزر المعاينة فوقه.
 */
export function VideoCard({
  product: p,
  owned,
  showGrade = true,
  headingLevel = 3,
  priority,
  fitTitle,
}: {
  product: ProductCard;
  owned?: boolean;
  showGrade?: boolean;
  headingLevel?: 2 | 3 | 4;
  priority?: boolean;
  /**
   * في القوائم العمودية (عمود واحد على الجوال) لا جيران لمحاذاة العنوان معهم، فلا يُحجز سطر ثانٍ فارغ.
   * يبقى معطّلًا للرفوف الأفقية (رف الرئيسية) حتى يتحاذى سطر المعلم والكبسولات بين البطاقات المتجاورة.
   */
  fitTitle?: boolean;
}) {
  const titleId = useId();
  const H = `h${headingLevel}` as "h3";
  const preview = !owned ? previewHref(p) : null;
  const chips = contentChips(p);
  const meta = [p.subjectName, showGrade ? p.gradeName : null].filter(Boolean).join(" · ");
  return (
    <article data-testid={p.isVideo ? "video-card" : undefined} className={cn(s.cardBase, s.vcard, toneClass(p.subjectSlug))}>
      <div className={cn("poster", s.vposter)}>
        {p.coverUrl ? (
          <>
            <Image src={p.coverUrl} alt="" fill sizes="(max-width: 640px) 85vw, (max-width: 1024px) 45vw, 300px" priority={priority} className={s.vposterImg} />
            <span className={s.vposterShade} aria-hidden />
          </>
        ) : (
          <span className={s.vart} aria-hidden>
            <SubjectArt slug={p.subjectSlug} />
          </span>
        )}
        <span className={cn("chip chip-glass", s.vtype)}>{PRODUCT_TYPE_LABELS[p.type]}</span>
        {p.previewLessonId ? (
          <span className={cn("chip chip-gold", s.vfree)}>
            <Sparkles aria-hidden />
            معاينة مجانية
          </span>
        ) : null}
        {p.isVideo ? (
          <span className={cn("play-dot", s.vplay)} aria-hidden>
            <Play fill="currentColor" />
          </span>
        ) : null}
      </div>
      <div className={s.vbody}>
        {p.teacherName ? (
          <span className={s.avatarFloat}>
            <TeacherAvatar name={p.teacherName} photoUrl={p.teacherPhotoUrl} size={50} inheritTone ring decorative />
          </span>
        ) : null}
        {meta ? <Kicker>{meta}</Kicker> : null}
        <H className={cn(s.vtitle, fitTitle && s.vtitleFit)}>
          <Link href={`/products/${p.slug}`} id={titleId} className="stretched">
            {p.title}
          </Link>
        </H>
        {p.teacherName ? <p className={s.vteacher}>{p.teacherName}</p> : null}
        {chips.length ? <p className={s.metaChips}>{chips}</p> : <span className="mb-3.5" />}
        <div className={s.vfoot}>
          {owned ? <OwnedChip /> : p.saleEnded ? <SaleEndedChip /> : <CompactPrice fils={p.priceFils} compareAt={p.compareAtPriceFils} />}
          {preview ? (
            <Link href={preview} className={s.footBtn} aria-describedby={titleId}>
              <Play fill="currentColor" aria-hidden />
              شاهد مجانًا
            </Link>
          ) : (
            <span className={cn(s.footBtn, s.footBtnQuiet)} aria-hidden>
              التفاصيل
              <ArrowLeft />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * عرض منتجات الفيديو:
 *  - scroller: رف أفقي قابل للسحب على الجوال، وشبكة ملصقات على الشاشات الأكبر
 *  - وإلا: قائمة صفوف ملونة مضغوطة
 */
export function VideoGrid({ products, ownedIds, scroller }: { products: ProductCard[]; ownedIds?: Set<string>; scroller?: boolean }) {
  if (!scroller) return <ProductList products={products} ownedIds={ownedIds} columns={2} />;
  return (
    <ul className={s.shelf}>
      {products.map((p) => (
        <li key={p.id}>
          <VideoCard product={p} owned={ownedIds?.has(p.id)} />
        </li>
      ))}
    </ul>
  );
}
