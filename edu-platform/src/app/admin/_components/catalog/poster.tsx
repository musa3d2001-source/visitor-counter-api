import Image from "next/image";
import { FileText, Layers, Play } from "lucide-react";
import { SubjectArt } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { ar, gradeClass, toneClass } from "@/lib/design";
import { PRODUCT_TYPE_LABELS, isPdfType, isVideoType, type ProductType } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * غلاف المنتج كما يظهر للطلاب تقريبًا: الغلاف المرفوع إن وُجد، وإلا الغلاف التلقائي بتدرج لون المادة ورسمها
 * (أو لون الصف ورقمه للباقة بلا مادة). زخرفي (aria-hidden) ما لم يُمرَّر alt.
 */
export function PosterPreview({
  type,
  subjectName,
  gradeName,
  gradeLevel,
  coverUrl,
  alt,
  className,
  sizes = "320px",
  compact = false,
}: {
  type: ProductType;
  subjectName: string | null;
  gradeName: string;
  gradeLevel: number | null;
  coverUrl?: string | null;
  alt?: string;
  className?: string;
  sizes?: string;
  /** نصوص أصغر للغلاف المصغّر (في شريط الرأس) */
  compact?: boolean;
}) {
  const slug = subjectSlugFromName(subjectName);
  const useGrade = !subjectName;
  const TypeIcon = isVideoType(type) ? Play : isPdfType(type) ? FileText : Layers;
  return (
    <div
      className={cn(
        "poster relative aspect-[4/5] w-full overflow-hidden rounded-[1.5rem] border-[3px] border-white shadow-[0_18px_30px_-18px_var(--d)]",
        useGrade ? cn("poster-grade", gradeClass(gradeLevel)) : toneClass(slug),
        className,
      )}
      aria-hidden={alt ? undefined : true}
    >
      {coverUrl ? (
        <Image src={coverUrl} alt={alt ?? ""} fill sizes={sizes} className="object-cover" />
      ) : (
        <>
          <span className={cn("chip chip-glass absolute z-10 truncate", compact ? "start-2 top-2 max-w-[calc(100%-1rem)] min-h-6 px-2 text-[0.7rem]" : "start-3 top-3 max-w-[calc(100%-1.5rem)]")}>
            {PRODUCT_TYPE_LABELS[type]}
          </span>
          <span className="absolute inset-x-[14%] top-[16%] bottom-[30%] block">
            {useGrade ? (
              <span
                className={cn("grid size-full place-items-center font-display leading-none font-black text-white drop-shadow-[0_6px_0_rgb(0_0_0/0.12)]", compact ? "text-[3.5rem]" : "text-[5.5rem]")}
              >
                {gradeLevel != null ? ar(gradeLevel) : ""}
              </span>
            ) : (
              <SubjectArt slug={slug} />
            )}
          </span>
          <span className={cn("absolute flex items-end justify-between gap-2", compact ? "inset-x-2 bottom-2" : "inset-x-3 bottom-3")}>
            <span className="min-w-0">
              <span className={cn("block truncate font-display leading-tight font-black text-white drop-shadow-[0_2px_6px_rgb(0_0_0/0.25)]", compact ? "text-[0.95rem]" : "text-[1.25rem]")}>
                {subjectName ?? "باقة"}
              </span>
              <span className={cn("chip chip-white mt-1 max-w-full truncate", compact ? "min-h-5 px-1.5 text-[0.62rem]" : "min-h-6 px-2 text-[0.72rem]")}>{gradeName}</span>
            </span>
            <span className={cn("grid shrink-0 place-items-center rounded-full bg-white text-[var(--b)] shadow-[0_0_0_6px_rgb(255_255_255/0.25)]", compact ? "size-7" : "size-10")}>
              <TypeIcon className="size-4" fill={TypeIcon === Play ? "currentColor" : "none"} strokeWidth={2.6} />
            </span>
          </span>
        </>
      )}
    </div>
  );
}
