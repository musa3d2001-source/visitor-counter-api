import Image from "next/image";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function Logo({ name, logoUrl, tone = "dark" }: { name: string; logoUrl: string | null; tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label={`${name} — الصفحة الرئيسية`}>
      {logoUrl ? (
        <Image src={logoUrl} alt="" width={40} height={40} className="size-10 rounded-xl object-contain" />
      ) : (
        <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
          <GraduationCap className="size-5.5" aria-hidden />
        </span>
      )}
      <span className={tone === "dark" ? "text-lg font-bold whitespace-nowrap text-ink" : "text-lg font-bold whitespace-nowrap text-white"}>{name}</span>
    </Link>
  );
}
