import Image from "next/image";
import { FileText, Package, PlayCircle } from "lucide-react";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** غلاف المنتج — صورة الغلاف إن وُجدت، وإلا غلاف مولّد متناسق مع الهوية */
const PALETTES = [
  ["#0f5257", "#1d6f6c"],
  ["#2d4a6b", "#3d6590"],
  ["#5b3f6e", "#7a5591"],
  ["#7a4a24", "#a0662f"],
  ["#2f5d3a", "#3f7c4d"],
  ["#6b2f3a", "#8e3f4d"],
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function ProductCover({
  coverUrl,
  title,
  type,
  subjectName,
  gradeName,
  className,
  priority,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  coverUrl: string | null;
  title: string;
  type: ProductType;
  subjectName: string | null;
  gradeName: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (coverUrl) {
    return (
      <div className={cn("relative aspect-[4/4.4] overflow-hidden bg-canvas sm:aspect-[4/5]", className)}>
        <Image src={coverUrl} alt={title} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  const [a, b] = PALETTES[hash(`${subjectName ?? ""}${gradeName}`) % PALETTES.length];
  const Icon = type === "bundle" ? Package : type === "video_course" ? PlayCircle : FileText;
  return (
    <div
      className={cn("relative flex aspect-[4/4.4] flex-col sm:aspect-[4/5] justify-between overflow-hidden p-4 text-white", className)}
      style={{ background: `linear-gradient(155deg, ${a}, ${b})` }}
      role="img"
      aria-label={title}
    >
      <div className="pointer-events-none absolute -start-10 -top-10 size-40 rounded-full bg-white/8" />
      <div className="pointer-events-none absolute -bottom-14 -end-8 size-44 rounded-full border-[18px] border-white/6" />
      <span className="relative w-fit rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold backdrop-blur-sm">{PRODUCT_TYPE_LABELS[type]}</span>
      <div className="relative">
        <Icon className="mb-2 size-7 text-[color:var(--accent)]" aria-hidden />
        <p className="text-lg leading-snug font-bold sm:text-xl">{subjectName ?? "باقة شاملة"}</p>
        <p className="mt-1 text-xs text-white/80">{gradeName}</p>
      </div>
    </div>
  );
}
