import { filsToKwdString } from "@/lib/money";
import { ar, savings } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * السعر: رقم Cairo عريض بالأرقام اللاتينية (عرف المنصة: «7.000 د.ك»)، والسعر قبل الخصم مشطوبًا،
 * وكبسولة «خصم ٢٠٪» فقط عند وجود خصم حقيقي (compareAt أعلى من السعر).
 * السعر القديم يُقرأ لقارئ الشاشة «بدلًا من 5.000 د.ك» ويظهر بنفس ترتيب السعر الحالي مشطوبًا كوحدة واحدة.
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
  const wasSizes = { sm: "text-[0.8rem]", md: "text-sm", lg: "text-[0.95rem]", xl: "text-base" };
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
          <span className="sr-only">بدلًا من {filsToKwdString(compareAt!)} د.ك</span>
          {/* السعر قبل الخصم بنفس ترتيب السعر الحالي (الرقم ثم «د.ك»)، وخط شطب واحد يعبر الوحدة كلها */}
          <s
            aria-hidden
            className={cn(
              "relative inline-flex items-baseline gap-1 font-bold whitespace-nowrap no-underline",
              "after:pointer-events-none after:absolute after:-inset-x-0.5 after:top-[52%] after:h-[1.5px] after:rounded-full after:content-['']",
              wasSizes[size],
              light ? "text-white/75 after:bg-white/80" : "text-muted after:bg-muted/80",
            )}
          >
            <span className="num">{filsToKwdString(compareAt!)}</span>
            <span className="text-[0.82em] font-extrabold">د.ك</span>
          </s>
          {showPercent ? (
            <span className="self-center rounded-full bg-coral-50 px-2 text-[0.8rem] leading-6 font-extrabold text-coral-700">خصم {ar(save.pct)}٪</span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
