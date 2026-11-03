import Image from "next/image";
import { initial, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * صورة المعلم، أو حرف اسمه الأول بخط Cairo الثقيل على تدرج لون المادة (أو الفيروزي افتراضيًا).
 * - subjectSlug: يلوّن التدرج بلون المادة؛ inheritTone: يرث متغيرات ‎--a/--b‎ من البطاقة الأم.
 * - ring: حلقة بيضاء + هالة ملونة (للبطاقات)؛ decorative: نص بديل فارغ حين يُكتب الاسم بجوارها.
 */
export function TeacherAvatar({
  name,
  photoUrl,
  size = 56,
  className,
  subjectSlug,
  inheritTone,
  ring,
  decorative,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  className?: string;
  subjectSlug?: string | null;
  inheritTone?: boolean;
  ring?: boolean | "lg";
  decorative?: boolean;
}) {
  const tone = inheritTone ? "" : subjectSlug !== undefined ? toneClass(subjectSlug) : "tone-brand";
  const ringShadow =
    ring === "lg"
      ? "0 0 0 5px #fff, 0 0 0 9px color-mix(in oklab, var(--a) 35%, white), 0 20px 30px -14px var(--b)"
      : ring
        ? "0 0 0 4px #fff, 0 8px 16px -8px rgb(23 32 38 / 0.45)"
        : undefined;
  if (photoUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-full bg-mist", tone, className)} style={{ width: size, height: size, boxShadow: ringShadow }}>
        <Image src={photoUrl} alt={decorative ? "" : name} fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-display font-black text-white", tone, className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(14, Math.round(size * 0.44)),
        lineHeight: 1,
        // الحرف الأبيض على الدرجتين الداكنتين ‎--b ثم --d‎ (لا على ‎--a‎ الفاتحة) فيبلغ تباينًا مقروءًا لكل الألوان
        backgroundImage:
          "radial-gradient(circle at 28% 20%, rgb(255 255 255 / 0.3), transparent 38%), linear-gradient(145deg, var(--b, var(--brand)), var(--d, var(--brand-edge)) 55%, var(--tink, var(--brand-deep)))",
        textShadow: "0 2px 0 rgb(0 0 0 / 0.22)",
        boxShadow: ringShadow,
      }}
      aria-hidden
    >
      {initial(name)}
    </span>
  );
}
