import Image from "next/image";
import { FileText, Layers, Play } from "lucide-react";
import { SubjectIcon } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { ar, gradeClass, toneClass } from "@/lib/design";
import { isContainerType, isPdfType, isVideoType } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * غلاف مصغر للمنتج في قوائم لوحة التحكم: مربع بتدرج لون المادة وأيقونتها،
 * وشارة صغيرة للنوع (تشغيل للفيديو، ورقة للمذكرة، طبقات للباقة). الباقة بلا مادة تأخذ لون الصف ورقمه.
 * يستخدم الغلاف المرفوع من المالك إن وُجد. زخرفي (aria-hidden): العنوان مكتوب بجواره.
 */
export function AdminThumb({
  type,
  subjectName,
  gradeLevel,
  coverUrl,
  size = "md",
  className,
}: {
  type: string;
  subjectName: string | null;
  gradeLevel?: number | null;
  coverUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const slug = subjectSlugFromName(subjectName);
  const useGrade = !subjectName && gradeLevel != null;
  const dims = size === "lg" ? "size-24 rounded-[1.4rem]" : size === "sm" ? "size-12 rounded-[0.9rem]" : "size-16 rounded-[1.15rem]";
  const icon = size === "lg" ? 40 : size === "sm" ? 20 : 28;
  const Badge = isContainerType(type) && !isVideoType(type) ? Layers : isVideoType(type) ? Play : isPdfType(type) ? FileText : null;
  return (
    <span
      className={cn(
        "poster relative grid shrink-0 place-items-center border-2 border-white text-white shadow-[0_8px_16px_-10px_var(--d)]",
        useGrade ? cn("poster-grade", gradeClass(gradeLevel)) : toneClass(slug),
        dims,
        className,
      )}
      aria-hidden
    >
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill sizes="96px" className="object-cover" />
      ) : useGrade ? (
        <span className="font-display leading-none font-black drop-shadow-[0_2px_4px_rgb(0_0_0/0.18)]" style={{ fontSize: icon * 1.15 }}>
          {ar(gradeLevel)}
        </span>
      ) : (
        <SubjectIcon slug={slug} size={icon} strokeWidth={2.3} />
      )}
      {Badge ? (
        <span
          className={cn(
            "absolute -start-1 -bottom-1 grid place-items-center rounded-full border-2 border-white bg-white text-[var(--b)] shadow-xs",
            size === "sm" ? "size-5 [&_svg]:size-2.5" : "size-7 [&_svg]:size-3.5",
          )}
        >
          <Badge fill={Badge === Play ? "currentColor" : "none"} strokeWidth={2.6} />
        </span>
      ) : null}
    </span>
  );
}
