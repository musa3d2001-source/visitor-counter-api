import Image from "next/image";
import { FileText, Package, Play } from "lucide-react";
import { SubjectArt, SubjectIcon } from "@/components/art";
import { PRODUCT_TYPE_LABELS, isVideoType, type ProductType } from "@/lib/labels";
import { subjectTone, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import { subjectSlugFromName } from "./card-parts";

/**
 * غلاف المحتوى «الفصل المشمس»: صورة الغلاف إن رفعها المالك، وإلا ملصق متدرج بلون المادة
 * (نقاط بيضاء، حلقة، رسم المادة) مع نوع المحتوى واسم المادة والصف وزر تشغيل للفيديو.
 * compact: مربع متدرج صغير بأيقونة المادة (السلة والمكتبة والقوائم).
 * المذكرات بنسبة كتيّب (4:5) والفيديو بنسبة شاشة (16:10) مع wide.
 */

/** لون داكن ثابت للمادة يصلح خلفيةً لنص أبيض (للتوافق مع الصفحات القديمة) */
export function posterTone(subjectName: string | null, _gradeName?: string, subjectSlug?: string | null) {
  return subjectTone(subjectSlug ?? subjectSlugFromName(subjectName)).deep;
}

/** خلفية الملصق المتدرجة بلون المادة (للاستخدام في style={{ background }}) */
export function posterBackground(subjectSlug: string | null | undefined) {
  const t = subjectTone(subjectSlug);
  return `radial-gradient(110% 80% at 95% 0%, rgb(255 255 255 / 0.36), transparent 55%), linear-gradient(150deg, ${t.from}, ${t.to})`;
}

export function ProductCover({
  coverUrl,
  title,
  type,
  subjectName,
  subjectSlug,
  gradeName,
  className,
  priority,
  compact,
  wide,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  coverUrl: string | null;
  title: string;
  type: ProductType;
  subjectName: string | null;
  /** مفتاح المادة للألوان؛ إن غاب يُستنتج من اسمها */
  subjectSlug?: string | null;
  gradeName: string;
  className?: string;
  priority?: boolean;
  /** نسخة مصغرة للصور الصغيرة (السلة والمكتبة والصفوف) */
  compact?: boolean;
  /** نسبة شاشة 16:10 بدل الكتيّب — للفيديو */
  wide?: boolean;
  sizes?: string;
}) {
  const video = isVideoType(type);
  const slug = subjectSlug ?? subjectSlugFromName(subjectName);
  const ratio = wide ? "aspect-[16/10]" : compact ? "aspect-square" : "aspect-[4/5]";
  if (coverUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-xl bg-mist", ratio, className)}>
        <Image src={coverUrl} alt={title} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const label = subjectName ?? (type === "bundle" ? "باقة" : gradeName);

  if (compact) {
    const Fallback = type === "bundle" ? Package : video ? Play : FileText;
    return (
      <div className={cn("poster grid place-items-center rounded-xl text-white", toneClass(slug), ratio, className)} role="img" aria-label={title}>
        {slug ? <SubjectIcon slug={slug} className="size-[38%] min-h-5 min-w-5 drop-shadow-[0_2px_4px_rgb(0_0_0/0.2)]" strokeWidth={2.2} /> : <Fallback className="size-[36%] min-h-5 min-w-5" aria-hidden />}
        {video ? (
          <span className="absolute end-1 bottom-1 grid size-[30%] max-h-7 max-w-7 min-h-4 min-w-4 place-items-center rounded-full bg-white" style={{ color: "var(--b)" }} aria-hidden>
            <Play className="size-1/2 fill-current" />
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("poster @container flex flex-col justify-between p-4 sm:p-5", toneClass(slug), ratio, className)} role="img" aria-label={title}>
      <span className="chip chip-glass self-start">{PRODUCT_TYPE_LABELS[type]}</span>
      <span className={cn("pointer-events-none absolute end-[4%] -rotate-6", wide ? "top-[12%] w-[40%]" : "top-[16%] w-[52%]")} aria-hidden>
        <span className="block aspect-square">
          <SubjectArt slug={slug} />
        </span>
      </span>
      {video ? (
        <span className={cn("play-dot absolute -mt-[1.8rem]", wide ? "end-[24%] top-[44%] -me-[1.8rem]" : "start-1/2 top-1/2 -ms-[1.8rem]")} aria-hidden>
          <Play className="-ms-0.5 size-6 fill-current" />
        </span>
      ) : null}
      <span className={cn("relative", wide && "max-w-[58%]")}>
        <span className={cn("block font-display leading-[1.3] font-black text-white [text-shadow:0_3px_0_color-mix(in_oklab,var(--d)_60%,transparent),0_8px_18px_rgb(0_0_0/0.22)]", wide ? "text-[clamp(1rem,7.5cqi,2rem)]" : "text-[clamp(1rem,11.5cqi,2.3rem)]")}>{label}</span>
        {subjectName ? <span className="mt-1 inline-block rounded-full bg-white/90 px-2.5 font-display text-[clamp(0.7rem,5cqi,0.85rem)] leading-7 font-extrabold" style={{ color: "var(--tink)" }}>{gradeName}</span> : null}
      </span>
    </div>
  );
}
