import Image from "next/image";
import { FileText, Package, Play } from "lucide-react";
import { PRODUCT_TYPE_LABELS, isVideoType, type ProductType } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * ملصق المحتوى — صورة الغلاف إن وُجدت، وإلا ملصق طباعي:
 * اسم المادة بخط العرض على لون داكن ثابت (تباين مرتفع)، ونوع المحتوى والصف بخط صغير.
 * المذكرات بنسبة كتيّب (4:5)، والفيديو بنسبة شاشة (16:10).
 */
const TONES = ["#16212b", "#0a5450", "#1f4a3a", "#2b4150"];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function posterTone(subjectName: string | null, gradeName: string) {
  return TONES[hash(`${subjectName ?? ""}${gradeName}`) % TONES.length];
}

export function ProductCover({
  coverUrl,
  title,
  type,
  subjectName,
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
  const ratio = wide ? "aspect-[16/10]" : "aspect-[4/5]";
  if (coverUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-mist", ratio, className)}>
        <Image src={coverUrl} alt={title} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const Icon = type === "bundle" ? Package : video ? Play : FileText;
  const label = subjectName ?? (type === "bundle" ? "باقة" : gradeName);
  return (
    <div
      className={cn("relative flex flex-col justify-between overflow-hidden text-white", ratio, compact ? "p-2" : "p-3.5 sm:p-4", className)}
      style={{ backgroundColor: posterTone(subjectName, gradeName) }}
      role="img"
      aria-label={title}
    >
      {compact ? null : <span className="text-[0.72rem] font-medium text-white/85">{PRODUCT_TYPE_LABELS[type]}</span>}
      <span className={cn("font-display font-semibold leading-[1.05]", compact ? "text-base" : wide ? "text-[clamp(1.4rem,4.5vw,2rem)]" : "text-[clamp(1.6rem,5vw,2.25rem)]")}>{label}</span>
      {compact ? null : (
        <span className="flex items-center justify-between text-[0.72rem] text-white/80">
          <span>{subjectName ? gradeName : ""}</span>
          <span className={cn("grid place-items-center rounded-full", video ? "size-8 bg-white text-ink" : "size-7 bg-white/12 text-white")} aria-hidden>
            <Icon className={cn("size-3.5", video && "fill-current")} />
          </span>
        </span>
      )}
    </div>
  );
}
