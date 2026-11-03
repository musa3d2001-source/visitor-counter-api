import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SubjectIcon } from "@/components/art";
import { count, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { catalogStyles as s } from "./card-parts";

export type SubjectTileData = { slug: string; name: string; icon?: string | null; productCount?: number | null };

/**
 * مربع المادة «الفصل المشمس» (v2-c): خلفية فاتحة بلون المادة، أيقونة في مربع متدرج، الاسم،
 * وعدد المحتوى الحقيقي («٤ منتجات» / «منتج واحد») إن مُرّر، وسهم يظهر عند المرور.
 * layout="row": نسخة أفقية للقوائم الجانبية.
 */
export function SubjectTile({
  subject: x,
  href,
  countLabel,
  layout = "tile",
  className,
}: {
  subject: SubjectTileData;
  href: string;
  /** نص بديل لسطر العدد (مثلًا «قريبًا»)؛ وإلا يُحسب من productCount */
  countLabel?: string;
  layout?: "tile" | "row";
  className?: string;
}) {
  const label = countLabel ?? (x.productCount != null ? count(x.productCount, { ...W.product, none: "لا يوجد محتوى بعد" }) : "");
  return (
    <Link href={href} className={cn(s.subj, layout === "row" && s.subjRow, toneClass(x.slug), className)}>
      <span className={cn("icon-tile", s.subjIcon)} aria-hidden>
        <SubjectIcon slug={x.slug} name={x.icon} size={26} />
      </span>
      <span className={s.subjText}>
        <b>{x.name}</b>
        {label ? <small>{label}</small> : null}
      </span>
      <span className={s.subjGo} aria-hidden>
        <ArrowLeft size={18} />
      </span>
    </Link>
  );
}

/** شبكة مربعات المواد: عمودان على الجوال، ثلاثة على المتوسطة، ستة على الكبيرة */
export function SubjectGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 xl:grid-cols-6 [&>li]:min-w-0", className)}>{children}</ul>;
}
