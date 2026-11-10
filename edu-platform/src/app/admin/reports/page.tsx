import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { Banknote, CalendarRange, ChartColumn, GraduationCap, Layers, Package, Receipt, RotateCcw, ScrollText, Ticket, Wallet } from "lucide-react";
import { auditLog, parseRange, reportByDay, reportByGrade, reportByProduct, reportByTeacher, reportSummary } from "@/server/admin/stats";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { CellTitle, EmptyValue } from "@/components/admin/data-list";
import { FilterBar, FilterSubmit, ResultCount, Segmented, Toolbar } from "@/components/admin/filter-bar";
import { SalesBars } from "@/components/admin/sales-bars";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ar, count, gradeVars, initial } from "@/lib/design";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { LONG_JOB_STATEMENT_MS, withDbDeadline } from "@/server/db";
import { PageBand } from "../_components/overview/bands";
import { ExportCsvButton } from "./_components/export-button";
import { Kwd, OP, SALE } from "../_components/overview/money";

export const metadata = { title: "التقارير" };

/** مهلة أوامر التقارير ٦٠ ثانية، فالدالة نفسها يجب ألا تقطعها قبل ذلك */
export const maxDuration = 60;

type SP = {
  from?: string;
  to?: string;
  test?: string;
  tab?: string;
  action?: string;
  entity?: string;
};

const ENTITY_TYPES = [
  ["", "كل الأنواع"],
  ["product", "المنتجات"],
  ["order", "الطلبات"],
  ["user", "المستخدمون"],
  ["coupon", "الكوبونات"],
  ["settings", "الإعدادات"],
  ["launch_check", "خطوات الإطلاق"],
  ["stage", "المراحل"],
  ["grade", "الصفوف"],
  ["subject", "المواد"],
] as const;

const AUDIT_ENTRY = {
  one: "عملية مسجلة",
  two: "عمليتان مسجلتان",
  plural: "عمليات مسجلة",
  acc: "عملية مسجلة",
  single: "عملية مسجلة واحدة",
};

/** «2026-11-03» ← «٣/١١/٢٠٢٦» */
function dayLabel(day: string) {
  const [y, m, d] = day.split("-");
  return y && m && d ? ar(`${Number(d)}/${Number(m)}/${y}`) : day;
}

function Tabs({ tab }: { tab: "sales" | "audit" }) {
  return (
    <Segmented
      label="أقسام التقارير"
      items={[
        {
          href: "/admin/reports?tab=sales",
          label: (
            <>
              <ChartColumn className="size-4" aria-hidden /> تقرير المبيعات
            </>
          ),
          active: tab === "sales",
        },
        {
          href: "/admin/reports?tab=audit",
          label: (
            <>
              <ScrollText className="size-4" aria-hidden /> سجل التدقيق
            </>
          ),
          active: tab === "audit",
        },
      ]}
      className="bg-white/80"
    />
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const tab = sp.tab === "audit" ? "audit" : "sales";

  if (tab === "audit") {
    const entity = ENTITY_TYPES.some(([k]) => k === sp.entity) ? sp.entity : undefined;
    const action = sp.action && /^[a-z_.]{1,60}$/.test(sp.action) ? sp.action : undefined;
    const rows = await auditLog({
      entityType: entity || undefined,
      action,
      limit: 200,
    });
    return (
      <div className="space-y-6">
        <PageBand tone="violet" art="chart">
          <AdminPageHeader title="التقارير" description="آخر ٢٠٠ عملية حساسة مسجلة" className="mb-0">
            <Tabs tab="audit" />
          </AdminPageHeader>
        </PageBand>
        <div>
          <FilterBar label="تصفية سجل التدقيق" className="lg:grid-cols-[1fr_1.4fr_auto]">
            <input type="hidden" name="tab" value="audit" />
            <Select name="entity" defaultValue={entity ?? ""} aria-label="نوع العنصر">
              {ENTITY_TYPES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
            <Input name="action" defaultValue={action} placeholder="الإجراء يبدأ بـ (مثال: entitlement)" dir="ltr" className="text-start" aria-label="الإجراء" />
            <FilterSubmit resetHref="/admin/reports?tab=audit" active={Boolean(entity || action)} className="sm:col-span-2 lg:col-span-1" />
          </FilterBar>
          <Toolbar start={<ResultCount>{count(rows.length, AUDIT_ENTRY)}</ResultCount>} />
          <Section title="سجل العمليات" icon={<ScrollText />} tone="violet" flush>
            {rows.length === 0 ? (
              <div className="p-4 sm:p-6">
                <EmptyState art="search" compact title="لا توجد عمليات مسجلة." />
              </div>
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
                      <TD className="font-display text-sm font-bold whitespace-nowrap">{r.actor_name ?? "النظام"}</TD>
                      <TD>
                        <code className="inline-block rounded-lg bg-violet-50 px-2 py-0.5 text-[0.75rem] font-semibold whitespace-nowrap text-violet-700" dir="ltr">
                          {r.action}
                        </code>
                      </TD>
                      <TD className="text-xs">
                        {r.entity_type === "order" && r.entity_id ? (
                          <Link href={`/admin/orders/${r.entity_id}`} className="chip chip-mint hover:underline">
                            طلب
                          </Link>
                        ) : r.entity_type === "product" && r.entity_id ? (
                          <Link href={`/admin/products/${r.entity_id}`} className="chip chip-mint hover:underline">
                            منتج
                          </Link>
                        ) : r.entity_type === "user" && r.entity_id ? (
                          <Link href={`/admin/students/${r.entity_id}`} className="chip chip-mint hover:underline">
                            مستخدم
                          </Link>
                        ) : (
                          <span className="chip">{r.entity_type}</span>
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
          </Section>
        </div>
      </div>
    );
  }

  const range = parseRange(sp);
  // مدى سنة كاملة يتجاوز مهلة الطلب العادية بوضوح عند كبر عدد الطلبات، فله مهلة التصدير نفسها، وعلى دفعتين حتى لا يملأ الحوض وحده
  const [[summary, byDay], [byProduct, byGrade, byTeacher]] = await withDbDeadline(LONG_JOB_STATEMENT_MS, async () => [
    await Promise.all([reportSummary(range), reportByDay(range)]),
    await Promise.all([reportByProduct(range), reportByGrade(range), reportByTeacher(range)]),
  ] as const);
  const exportQs = new URLSearchParams({
    from: range.fromDay,
    to: range.toDay,
    ...(range.includeTest ? { test: "1" } : {}),
  }).toString();

  // سلسلة أيام كاملة للمخطط
  const dayMap = new Map(byDay.map((d) => [d.day, d]));
  const series: { day: string; orders: number; revenueFils: number }[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime() && series.length < 370; t += 86400_000) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuwait",
    }).format(new Date(t + 3 * 3600_000));
    const d = dayMap.get(key);
    series.push({
      day: key,
      orders: d?.orders ?? 0,
      revenueFils: d?.revenueFils ?? 0,
    });
  }
  const gradeMax = Math.max(1, ...byGrade.map((x) => x.revenueFils));
  const productMax = Math.max(1, ...byProduct.map((x) => x.revenueFils));

  return (
    <div className="space-y-6">
      <PageBand tone="violet" art="chart">
        <AdminPageHeader
          title="التقارير"
          description={
            <>
              من <span className="font-bold text-ink">{dayLabel(range.fromDay)}</span> إلى <span className="font-bold text-ink">{dayLabel(range.toDay)}</span>
              {range.includeTest ? "، تشمل الطلبات التجريبية" : ""}
            </>
          }
          actions={
            <ExportCsvButton query={exportQs} variant="primary" size="md" testId="export-orders" />
          }
          className="mb-0"
        >
          <Tabs tab="sales" />
        </AdminPageHeader>
      </PageBand>

      <FilterBar label="فترة التقرير" className="items-end lg:grid-cols-[1fr_1fr_auto_auto]">
        <label className="min-w-0 text-sm">
          <span className="mb-1.5 flex items-center gap-1.5 font-display font-bold text-ink-soft">
            <CalendarRange className="size-4 text-violet" aria-hidden /> من تاريخ
          </span>
          <Input type="date" name="from" defaultValue={range.fromDay} className="num" />
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1.5 flex items-center gap-1.5 font-display font-bold text-ink-soft">
            <CalendarRange className="size-4 text-violet" aria-hidden /> إلى تاريخ
          </span>
          <Input type="date" name="to" defaultValue={range.toDay} className="num" />
        </label>
        <div className="flex min-h-12 items-center rounded-2xl bg-mist/60 px-3">
          <Checkbox name="test" value="1" defaultChecked={range.includeTest} label="تضمين التجريبية" />
        </div>
        <Button type="submit" variant="primary" className="h-12">
          عرض التقرير
        </Button>
      </FilterBar>

      <StatGrid className="lg:grid-cols-5">
        <StatTile label="عدد الطلبات" value={<span className="num">{ar(summary.orders)}</span>} icon={<Receipt />} />
        <StatTile label="الإيرادات" value={<Kwd fils={summary.revenueFils} />} icon={<Banknote />} />
        <StatTile label="الخصومات" value={<Kwd fils={summary.discountsFils} />} icon={<Ticket />} />
        <StatTile label="الاستردادات" value={<Kwd fils={summary.refundsFils} />} hint={summary.refundsCount ? count(summary.refundsCount, OP) : "لا توجد استردادات"} icon={<RotateCcw />} />
        <StatTile label="الصافي" value={<Kwd fils={summary.netFils} />} icon={<Wallet />} tone="teal" className="col-span-2 lg:col-span-1" />
      </StatGrid>

      <Section title="المبيعات اليومية" description="قيمة الطلبات المدفوعة لكل يوم في الفترة المحددة" icon={<ChartColumn />} tone="violet">
        <SalesBars data={series} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Section title="حسب المنتج" icon={<Package />} tone="sky" flush>
          {byProduct.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState art="receipt" compact title="لا توجد مبيعات في هذه الفترة." />
            </div>
          ) : (
            <>
              <div className="max-sm:hidden">
                <Table className="min-w-[520px]">
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
                        <TD className="max-w-[22rem]">
                          <CellTitle href={`/admin/products/${p.product_id}`} title={p.title} sub={PRODUCT_TYPE_LABELS[p.type as ProductType] ?? p.type} />
                        </TD>
                        <TD>
                          <span className="chip chip-mint">{count(p.sold, SALE)}</span>
                        </TD>
                        <TD className="min-w-36">
                          <Kwd fils={p.revenueFils} className="font-display font-black text-ink" />
                          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sky-50" aria-hidden>
                            <span
                              className="block h-full rounded-full bg-linear-to-l from-[#7CC4FF] to-[#3B6FE0]"
                              style={{
                                width: `${Math.max(4, (p.revenueFils / productMax) * 100)}%`,
                              }}
                            />
                          </span>
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
              <ul className="divide-y divide-line sm:hidden">
                {byProduct.map((p) => (
                  <li key={p.product_id} className="flex items-start gap-3 px-4 py-3.5">
                    <CellTitle href={`/admin/products/${p.product_id}`} title={p.title} sub={PRODUCT_TYPE_LABELS[p.type as ProductType] ?? p.type} className="flex-1" />
                    <div className="shrink-0 text-end">
                      <Kwd fils={p.revenueFils} className="font-display font-black text-ink" />
                      <p className="text-[0.78rem] text-muted">{count(p.sold, SALE)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
        <Section title="حسب الصف" icon={<Layers />} tone="green">
          {byGrade.length === 0 ? (
            <EmptyState art="generic" compact title="لا توجد مبيعات في هذه الفترة." />
          ) : (
            <ul className="space-y-4">
              {byGrade.map((g) => (
                <li key={g.grade_name} style={gradeVars(g.level)}>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="flex items-center gap-2 font-display font-extrabold text-ink">
                      <span
                        className="grid size-8 place-items-center rounded-[0.7rem] bg-linear-to-br from-[var(--a)] to-[var(--b)] font-display text-[0.95rem] font-black text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.14)]"
                        aria-hidden
                      >
                        {ar(g.level)}
                      </span>
                      {g.grade_name}
                    </span>
                    <span className="text-sm text-muted">
                      <Kwd fils={g.revenueFils} className="font-display font-black text-ink" /> · {count(g.sold, SALE)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[var(--soft)]">
                    <div
                      className="h-full rounded-full bg-linear-to-l from-[var(--a)] to-[var(--b)]"
                      style={{
                        width: `${Math.max(3, (g.revenueFils / gradeMax) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 rounded-2xl bg-mist/70 px-4 py-3 text-xs leading-6 text-ink-soft">ملاحظة: إيرادات المنتج تُحسب بسعره وقت الطلب قبل خصم الكوبون.</p>
        </Section>
      </div>

      <Section
        title="حسب المعلم"
        description="نسبة كل بيع للمعلم وقت الشراء (لا تتغير بتعديل ملفه). الحصص من السجل المحاسبي للمعلمين المفعّل لهم نظام الأرباح."
        icon={<GraduationCap />}
        tone="pink"
        flush
        actions={
          <ExportCsvButton query={`${exportQs}&type=teachers`} variant="outline" size="sm" testId="export-teachers" />
        }
      >
        {byTeacher.length === 0 ? (
          <div className="p-4 sm:p-6">
            <EmptyState art="search" compact title="لا توجد مبيعات في هذه الفترة." />
          </div>
        ) : (
          <>
            <div className="max-sm:hidden">
              <Table>
                <THead>
                  <tr>
                    <TH>المعلم</TH>
                    <TH>عمليات البيع</TH>
                    <TH>قيمة المبيعات</TH>
                    <TH>حصة المعلم</TH>
                    <TH>حصة المنصة (من المؤهل)</TH>
                  </tr>
                </THead>
                <tbody>
                  {byTeacher.map((t) => (
                    <TR key={t.teacherId ?? "platform"}>
                      <TD>
                        <span className="flex items-center gap-3">
                          <span
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#FF85B8] to-[#C42F86] font-display text-[1rem] font-black text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)]"
                            aria-hidden
                          >
                            {initial(t.teacherName)}
                          </span>
                          <CellTitle href={t.teacherId ? `/admin/teachers/${t.teacherId}` : undefined} title={t.teacherName} />
                        </span>
                      </TD>
                      <TD>
                        <span className="chip chip-mint">{count(t.sold, SALE)}</span>
                      </TD>
                      <TD>
                        <Kwd fils={t.revenueFils} className="font-display font-black text-ink" />
                      </TD>
                      <TD>{t.teacherShareFils ? <Kwd fils={t.teacherShareFils} className="font-display font-bold text-[#A8256F]" /> : <EmptyValue label="لا يوجد" />}</TD>
                      <TD>{t.platformShareFils ? <Kwd fils={t.platformShareFils} className="font-display font-bold text-brand-800" /> : <EmptyValue label="لا يوجد" />}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-line sm:hidden">
              {byTeacher.map((t) => (
                <li key={t.teacherId ?? "platform"} className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#FF85B8] to-[#C42F86] font-display text-[1rem] font-black text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)]"
                      aria-hidden
                    >
                      {initial(t.teacherName)}
                    </span>
                    <CellTitle href={t.teacherId ? `/admin/teachers/${t.teacherId}` : undefined} title={t.teacherName} sub={count(t.sold, SALE)} className="flex-1" />
                    <Kwd fils={t.revenueFils} className="shrink-0 font-display font-black text-ink" />
                  </div>
                  {t.teacherShareFils || t.platformShareFils ? (
                    <dl className="mt-2.5 grid grid-cols-2 gap-2 text-[0.8rem]">
                      <div className="rounded-xl bg-[#FFE6F1]/70 px-3 py-1.5">
                        <dt className="font-bold text-[#A8256F]">حصة المعلم</dt>
                        <dd>{t.teacherShareFils ? <Kwd fils={t.teacherShareFils} className="font-display font-black text-ink" /> : <EmptyValue label="لا يوجد" />}</dd>
                      </div>
                      <div className="rounded-xl bg-brand-50 px-3 py-1.5">
                        <dt className="font-bold text-brand-800">حصة المنصة</dt>
                        <dd>{t.platformShareFils ? <Kwd fils={t.platformShareFils} className="font-display font-black text-ink" /> : <EmptyValue label="لا يوجد" />}</dd>
                      </div>
                    </dl>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
