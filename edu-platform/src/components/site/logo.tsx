import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "@/components/art";
import { cn } from "@/lib/utils";

/**
 * الشعار: صورة الشعار من الإعدادات إن وُجدت، وإلا علامة «درب» (طريق نحو الشمس)،
 * مع اسم المنصة بخط Cairo الثقيل وسطر فرعي اختياري (مثل «المرحلة المتوسطة»).
 */
export function Logo({
  name,
  logoUrl,
  tone = "dark",
  subtitle,
  size = 44,
  className,
}: {
  name: string;
  logoUrl: string | null;
  tone?: "dark" | "light";
  subtitle?: string;
  size?: number;
  className?: string;
}) {
  const light = tone === "light";
  return (
    <Link href="/" className={cn("inline-flex min-h-12 shrink-0 items-center gap-2.5 rounded-2xl sm:gap-3", className)} aria-label={`${name}، الصفحة الرئيسية`}>
      {logoUrl ? (
        <span className="grid shrink-0 place-items-center overflow-hidden rounded-[15px] bg-white shadow-card" style={{ width: size, height: size }}>
          <Image src={logoUrl} alt="" width={size} height={size} className="size-full object-contain p-1" />
        </span>
      ) : (
        <LogoMark size={size} className="shrink-0 drop-shadow-[0_6px_10px_rgb(6_80_75/0.25)]" />
      )}
      <span className="flex flex-col">
        <span className={cn("font-display text-[1.3rem] leading-[1.25] font-black sm:text-[1.45rem]", light ? "text-white" : "text-brand-800")}>{name}</span>
        {subtitle ? <span className={cn("text-[0.78rem] leading-[1.3] font-bold", light ? "text-white/70" : "text-muted")}>{subtitle}</span> : null}
      </span>
    </Link>
  );
}
