import { filsToKwdString } from "@/lib/money";
import { ar, savings } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * السعر: رقم Cairo عريض بالأرقام اللاتينية (عرف المنصة: «7.000 د.ك»)، والسعر قبل الخصم مشطوبًا،
 * وكبسولة «خصم ٢٠٪» فقط عند وجود خصم حقيقي (compareAt أعلى من السعر).
 * tone="light" للأسطح الداكنة.
 */
export function Price({
  fils,
  compareAt,
  className,
  size = "md",
  showPercent = true,
  tone = "default",
}: {
  fils: number;
  compareAt?: number | null;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  showPercent?: boolean;
  tone?: "default" | "light";
}) {
  const sizes = { sm: "text-base", md: "text-xl", lg: "text-[1.7rem]", xl: "text-[2.2rem]" };
  const save = savings(fils, compareAt);
  const light = tone === "light";
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1 font-display", className)}>
      {fils === 0 ? (
        <span className={cn("leading-snug font-black", light ? "text-[#9BEBD8]" : "text-success", sizes[size])}>مجانًا</span>
      ) : (
        <span className={cn("leading-snug font-black whitespace-nowrap", light ? "text-white" : "text-brand-800", sizes[size])}>
          <span className="num">{filsToKwdString(fils)}</span>{" "}
          <span className={cn("text-[0.66em] font-extrabold", light ? "text-white/75" : "text-muted")}>د.ك</span>
        </span>
      )}
      {save ? (
        <>
          <span className={cn("text-sm font-bold line-through decoration-[1.5px]", light ? "text-white/70" : "text-muted decoration-muted/70")}>
            <span className="sr-only">السعر قبل الخصم </span>
            <span className="num">{filsToKwdString(compareAt!)}</span> د.ك
          </span>
          {showPercent ? (
            <span className="self-center rounded-full bg-coral-50 px-2 text-[0.8rem] leading-6 font-extrabold text-coral-700">خصم {ar(save.pct)}٪</span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
