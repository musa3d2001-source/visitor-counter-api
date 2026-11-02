import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Price({ fils, compareAt, className, size = "md" }: { fils: number; compareAt?: number | null; className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-base", md: "text-lg", lg: "text-3xl" };
  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      {fils === 0 ? (
        <span className={cn("font-bold text-success", sizes[size])}>مجانًا</span>
      ) : (
        <span className={cn("font-bold text-ink", sizes[size])}>
          <span className="num">{filsToKwdString(fils)}</span> <span className="text-[0.7em] font-semibold text-muted">د.ك</span>
        </span>
      )}
      {compareAt && compareAt > fils ? (
        <span className="text-sm text-muted line-through decoration-danger/50">
          <span className="num">{filsToKwdString(compareAt)}</span> د.ك
        </span>
      ) : null}
    </div>
  );
}
