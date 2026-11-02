import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** الشعار: صورة الشعار من الإعدادات إن وُجدت، مع اسم المنصة بخط العرض */
export function Logo({ name, logoUrl, tone = "dark" }: { name: string; logoUrl: string | null; tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label={`${name}، الصفحة الرئيسية`}>
      {logoUrl ? <Image src={logoUrl} alt="" width={36} height={36} className="size-9 rounded-md object-contain" /> : null}
      <span className={cn("font-display text-[1.75rem] leading-none font-bold", tone === "dark" ? "text-ink" : "text-white")}>{name}</span>
    </Link>
  );
}
