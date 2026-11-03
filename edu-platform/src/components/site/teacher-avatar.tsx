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
        backgroundImage: "radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.4), transparent 45%), linear-gradient(145deg, var(--a, var(--brand-hi)), var(--b, var(--brand)))",
        textShadow: size >= 64 ? "0 3px 10px rgb(0 0 0 / 0.18)" : undefined,
        boxShadow: ringShadow,
      }}
      aria-hidden
    >
      {initial(name)}
    </span>
  );
}
