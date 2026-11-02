import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { Download } from "lucide-react";
import { auditLog, parseRange, reportByDay, reportByGrade, reportByProduct, reportSummary } from "@/server/admin/stats";
import { AdminPageHeader, Section, StatCard } from "@/components/admin/page-header";
import { SalesBars } from "@/components/admin/sales-bars";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "التقارير" };

type SP = { from?: string; to?: string; test?: string; tab?: string; action?: string; entity?: string };

const ENTITY_TYPES = [
  ["", "كل الأنواع"],
  ["product", "المنتجات"],
  ["order", "الطلبات"],
  ["user", "المستخدمون"],
  ["coupon", "الكوبونات"],
  ["settings", "الإعدادات"],
  ["stage", "المراحل"],
  ["grade", "الصفوف"],
  ["subject", "المواد"],
] as const;

function kwd(f: number) {
  return (
    <>
      <span className="num">{filsToKwdString(f)}</span> <span className="text-xs text-muted">د.ك</span>
    </>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const tab = sp.tab === "audit" ? "audit" : "sales";
  const tabs = (
    <div className="mb-6 flex gap-1 rounded-xl bg-surface p-1 shadow-card" role="tablist">
      {[
        ["sales", "تقرير المبيعات"],
        ["audit", "سجل التدقيق"],
      ].map(([k, label]) => (
        <Link
          key={k}
          href={`/admin/reports?tab=${k}`}
          role="tab"
          aria-selected={tab === k}
          className={cn("flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold", tab === k ? "bg-brand-600 text-white" : "text-muted hover:text-ink")}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (tab === "audit") {
    const entity = ENTITY_TYPES.some(([k]) => k === sp.entity) ? sp.entity : undefined;
    const action = sp.action && /^[a-z_.]{1,60}$/.test(sp.action) ? sp.action : undefined;
    const rows = await auditLog({ entityType: entity || undefined, action, limit: 200 });
    return (
      <div>
        <AdminPageHeader title="التقارير" description="آخر 200 عملية حساسة مسجلة" />
        {tabs}
        <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="tab" value="audit" />
          <Select name="entity" defaultValue={entity ?? ""} aria-label="نوع العنصر">
            {ENTITY_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Input name="action" defaultValue={action} placeholder="الإجراء يبدأ بـ (مثال: entitlement)" dir="ltr" className="text-start" aria-label="الإجراء" />
          <Button type="submit" variant="secondary">
            تصفية
          </Button>
        </form>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">لا توجد عمليات مسجلة.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>الوقت</TH>
                <TH>المنفذ</TH>
                <TH>الإجراء</TH>
                <TH>العنصر</TH>
                <TH>السبب / التفاصيل</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="text-xs whitespace-nowrap text-muted">{formatDateTime(r.created_at)}</TD>
                  <TD className="text-sm">{r.actor_name ?? "النظام"}</TD>
                  <TD className="text-xs font-semibold" dir="ltr">
                    {r.action}
                  </TD>
                  <TD className="text-xs">
                    {r.entity_type === "order" && r.entity_id ? (
                      <Link href={`/admin/orders/${r.entity_id}`} className="text-brand-700 hover:underline">
                        طلب
                      </Link>
                    ) : r.entity_type === "product" && r.entity_id ? (
                      <Link href={`/admin/products/${r.entity_id}`} className="text-brand-700 hover:underline">
                        منتج
                      </Link>
                    ) : r.entity_type === "user" && r.entity_id ? (
                      <Link href={`/admin/students/${r.entity_id}`} className="text-brand-700 hover:underline">
                        مستخدم
                      </Link>
                    ) : (
                      r.entity_type
                    )}
                  </TD>
                  <TD className="max-w-md text-xs text-ink-soft">
                    {r.reason ? <p>السبب: {r.reason}</p> : null}
                    {r.metadata && Object.keys(r.metadata as object).length ? (
                      <code className="line-clamp-2 break-all text-[0.7rem] text-muted" dir="ltr">
                        {JSON.stringify(r.metadata)}
                      </code>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    );
  }

  const range = parseRange(sp);
  const [summary, byDay, byProduct, byGrade] = await Promise.all([reportSummary(range), reportByDay(range), reportByProduct(range), reportByGrade(range)]);
  const exportQs = new URLSearchParams({ from: range.fromDay, to: range.toDay, ...(range.includeTest ? { test: "1" } : {}) }).toString();

  // سلسلة أيام كاملة للمخطط
  const dayMap = new Map(byDay.map((d) => [d.day, d]));
  const series: { day: string; orders: number; revenueFils: number }[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime() && series.length < 370; t += 86400_000) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date(t + 3 * 3600_000));
    const d = dayMap.get(key);
    series.push({ day: key, orders: d?.orders ?? 0, revenueFils: d?.revenueFils ?? 0 });
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="التقارير"
        description={`من ${range.fromDay} إلى ${range.toDay}${range.includeTest ? " · تشمل الطلبات التجريبية" : ""}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/admin/reports/export?${exportQs}`}>
              <Download aria-hidden /> تصدير CSV
            </a>
          </Button>
        }
      />
      {tabs}
      <form className="grid items-end gap-3 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink-soft">من تاريخ</span>
          <Input type="date" name="from" defaultValue={range.fromDay} className="num" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink-soft">إلى تاريخ</span>
          <Input type="date" name="to" defaultValue={range.toDay} className="num" />
        </label>
        <div className="pb-3">
          <Checkbox name="test" value="1" defaultChecked={range.includeTest} label="تضمين التجريبية" />
        </div>
        <Button type="submit" variant="secondary">
          عرض التقرير
        </Button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="عدد الطلبات" value={<span className="num">{summary.orders}</span>} />
        <StatCard label="الإيرادات" value={kwd(summary.revenueFils)} />
        <StatCard label="الخصومات" value={kwd(summary.discountsFils)} />
        <StatCard label="الاستردادات" value={kwd(summary.refundsFils)} hint={`${summary.refundsCount} عملية`} />
        <StatCard label="الصافي" value={kwd(summary.netFils)} />
      </div>

      <Section title="المبيعات اليومية">
        <SalesBars data={series} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Section title="حسب المنتج">
          {byProduct.length === 0 ? (
            <p className="text-sm text-muted">لا توجد مبيعات في هذه الفترة.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>المنتج</TH>
                  <TH>عدد المبيعات</TH>
                  <TH>الإيراد</TH>
                </tr>
              </THead>
              <tbody>
                {byProduct.map((p) => (
                  <TR key={p.product_id}>
                    <TD>
                      <Link href={`/admin/products/${p.product_id}`} className="font-semibold hover:text-brand-700">
                        {p.title}
                      </Link>
                      <p className="text-xs text-muted">{PRODUCT_TYPE_LABELS[p.type as ProductType] ?? p.type}</p>
                    </TD>
                    <TD className="num">{p.sold}</TD>
                    <TD>{kwd(p.revenueFils)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
        <Section title="حسب الصف">
          {byGrade.length === 0 ? (
            <p className="text-sm text-muted">لا توجد مبيعات في هذه الفترة.</p>
          ) : (
            <ul className="space-y-3">
              {byGrade.map((g) => {
                const max = Math.max(...byGrade.map((x) => x.revenueFils), 1);
                return (
                  <li key={g.grade_name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold">{g.grade_name}</span>
                      <span>
                        {kwd(g.revenueFils)} · <span className="num">{g.sold}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(g.revenueFils / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted">ملاحظة: إيرادات المنتج تُحسب بسعره وقت الطلب قبل خصم الكوبون.</p>
        </Section>
      </div>
    </div>
  );
}
