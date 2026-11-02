import Image from "next/image";
import { cn } from "@/lib/utils";
import { initials } from "./format";

/** صورة المعلم، أو حرف اسمه الأول بخط العرض على خلفية هادئة */
export function TeacherAvatar({ name, photoUrl, size = 56, className }: { name: string; photoUrl: string | null; size?: number; className?: string }) {
  if (photoUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-full bg-mist", className)} style={{ width: size, height: size }}>
        <Image src={photoUrl} alt={name} fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  const letter = initials(name).split(" ")[0] ?? "";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-mist font-display font-semibold text-brand-800", className)}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.5), lineHeight: 1 }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
