import Image from "next/image";
import { cn } from "@/lib/utils";
import { initials } from "./format";

/** صورة المعلم، أو أحرف اسمه الأولى عند عدم وجود صورة */
export function TeacherAvatar({ name, photoUrl, size = 56, className }: { name: string; photoUrl: string | null; size?: number; className?: string }) {
  if (photoUrl) {
    return (
      <span className={cn("relative block shrink-0 overflow-hidden rounded-full bg-brand-50 ring-2 ring-surface", className)} style={{ width: size, height: size }}>
        <Image src={photoUrl} alt={name} fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 font-bold text-white ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.32) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
