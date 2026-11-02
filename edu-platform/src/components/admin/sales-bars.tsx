import { filsToKwdString } from "@/lib/money";

/** مخطط أعمدة بسيط للمبيعات اليومية (CSS فقط، بدون مكتبات) */
export function SalesBars({ data }: { data: { day: string; orders: number; revenueFils: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenueFils));
  const total = data.reduce((s, d) => s + d.revenueFils, 0);
  if (total === 0) {
    return <p className="rounded-lg bg-mist p-6 text-center text-sm text-muted">لا توجد مبيعات مدفوعة في هذه الفترة.</p>;
  }
  const step = Math.ceil(data.length / 8);
  return (
    <div>
      <div className="flex h-44 items-end gap-[2px] sm:gap-1" role="img" aria-label="مخطط المبيعات اليومية">
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[2px] bg-brand-600 transition-colors group-hover:bg-accent-600"
              style={{ height: `${Math.max(d.revenueFils > 0 ? 3 : 0, (d.revenueFils / max) * 100)}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[0.7rem] whitespace-nowrap text-white group-hover:block">
              <span className="num">{d.day}</span>: <span className="num">{filsToKwdString(d.revenueFils)}</span> د.ك، <span className="num">{d.orders}</span> طلب
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[2px] text-[0.65rem] text-muted sm:gap-1">
        {data.map((d, i) => (
          <span key={d.day} className="num flex-1 text-center">
            {i % step === 0 ? d.day.slice(5) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
