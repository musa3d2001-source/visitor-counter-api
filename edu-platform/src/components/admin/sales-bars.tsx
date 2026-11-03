import { Crown } from "lucide-react";
import { SpotArt } from "@/components/art";
import { count, W } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";

/** «3/11» من «2026-11-03» */
function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return m && d ? `${Number(d)}/${Number(m)}` : day;
}

/**
 * مخطط أعمدة المبيعات اليومية (CSS فقط): أعمدة فيروزية متدرجة مستديرة، أعلى يوم بالذهبي،
 * خطوط مرجعية بقيمة الحد الأعلى، تلميح عند المرور، وجدول مخفي لقارئات الشاشة.
 * الأيام من الأقدم (يمين) إلى الأحدث (يسار) بما يناسب اتجاه القراءة.
 */
export function SalesBars({ data, className }: { data: { day: string; orders: number; revenueFils: number }[]; className?: string }) {
  const max = Math.max(1, ...data.map((d) => d.revenueFils));
  const total = data.reduce((s, d) => s + d.revenueFils, 0);
  if (total === 0) {
    return (
      <div className={cn("bg-sunny flex flex-col items-center gap-1 rounded-[1.5rem] border border-white px-6 py-8 text-center shadow-xs sm:flex-row sm:gap-5 sm:text-start", className)}>
        <div className="h-20 w-24 shrink-0 text-brand-600">
          <SpotArt kind="receipt" />
        </div>
        <div>
          <p className="font-display text-[1.1rem] font-black text-ink">لا توجد مبيعات مدفوعة في هذه الفترة.</p>
          <p className="mt-0.5 text-[0.88rem] leading-6 text-muted">سيظهر المخطط هنا فور تأكيد أول عملية دفع.</p>
        </div>
      </div>
    );
  }
  const best = data.reduce((b, d) => (d.revenueFils > b.revenueFils ? d : b), data[0]);
  const step = Math.max(1, Math.ceil(data.length / 7));
  const dense = data.length > 45;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2 font-display text-[0.8rem] font-bold text-ink-soft">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">
          <span className="size-2.5 rounded-full bg-linear-to-b from-brand-400 to-brand-600" aria-hidden />
          مبيعات اليوم
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-2.5 py-1 text-accent-900">
          <Crown className="size-3.5" aria-hidden />
          أعلى يوم: <span className="num">{shortDay(best.day)}</span> · <span className="num">{filsToKwdString(best.revenueFils)}</span> د.ك
        </span>
      </div>

      <div className="relative" aria-hidden>
        {/* خطوط مرجعية */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-px">
          {[1, 0.5, 0].map((f) => (
            <div key={f} className="relative border-t border-dashed border-line-strong/80">
              {f > 0 ? (
                <span className="num absolute end-0 top-0 -translate-y-1/2 bg-surface ps-1.5 text-[0.7rem] font-bold text-muted">
                  {filsToKwdString(Math.round(max * f))}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div className={cn("relative flex h-48 items-end pe-12 sm:h-56", dense ? "gap-[2px]" : "gap-[3px] sm:gap-1.5")}>
          {data.map((d) => {
            const top = d === best;
            const h = d.revenueFils > 0 ? Math.max(4, (d.revenueFils / max) * 100) : 0;
            return (
              <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end justify-center">
                {h > 0 ? (
                  <div
                    className={cn(
                      "w-full max-w-9 rounded-t-full rounded-b-[4px] transition-[filter,transform] duration-150 group-hover:brightness-110",
                      top
                        ? "bg-linear-to-b from-[#FFD25E] to-accent-700 shadow-[0_6px_14px_-6px_rgb(201_133_0/0.7)]"
                        : "bg-linear-to-b from-brand-400 to-brand-600 shadow-[0_6px_12px_-8px_var(--brand-edge)]",
                    )}
                    style={{ height: `${h}%` }}
                  />
                ) : (
                  <div className="h-1 w-full max-w-9 rounded-full bg-line-strong/70" />
                )}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-[0.75rem] leading-5 whitespace-nowrap text-white shadow-lift group-hover:block">
                  <span className="num block font-display font-extrabold">{d.day}</span>
                  <span className="num">{filsToKwdString(d.revenueFils)}</span> د.ك · {count(d.orders, W.order)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={cn("mt-2 flex pe-12 text-[0.72rem] font-bold text-muted", dense ? "gap-[2px]" : "gap-[3px] sm:gap-1.5")} aria-hidden>
        {data.map((d, i) => (
          <span key={d.day} className="num min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">
            {i % step === 0 ? shortDay(d.day) : ""}
          </span>
        ))}
      </div>

      {/* بديل نصي للمخطط */}
      <table className="sr-only">
        <caption>مخطط المبيعات اليومية</caption>
        <thead>
          <tr>
            <th scope="col">اليوم</th>
            <th scope="col">المبيعات (د.ك)</th>
            <th scope="col">الطلبات</th>
          </tr>
        </thead>
        <tbody>
          {data
            .filter((d) => d.revenueFils > 0 || d.orders > 0)
            .map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{filsToKwdString(d.revenueFils)}</td>
                <td>{d.orders}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
