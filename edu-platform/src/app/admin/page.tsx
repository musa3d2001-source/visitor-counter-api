import Link from "next/link";
import { Banknote, FileText, Receipt, Users } from "lucide-react";
import { dashboardTotals, latestOrders, salesByDay, topProducts } from "@/server/admin/stats";
import { AdminPageHeader, Section, StatCard } from "@/components/admin/page-header";
import { SalesBars } from "@/components/admin/sales-bars";
import { OrderStatusBadge, TestBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { formatDateTime, cn } from "@/lib/utils";

export const metadata = { title: "الرئيسية" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ days?: string; test?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const includeTest = sp.test === "1";
  const [totals, latest, top, series] = await Promise.all([
    dashboardTotals(includeTest),
    latestOrders(8, includeTest),
    topProducts(6, includeTest),
    salesByDay(days, includeTest),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...(sp.days ? { days: sp.days } : {}), ...(includeTest ? { test: "1" } : {}) });
    for (const [k, v] of Object.entries(patch)) (v === undefined ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="لوحة المعلومات"
        description={includeTest ? "تشمل الأرقام الطلبات التجريبية (Sandbox)" : "الأرقام من الطلبات الحقيقية فقط — الطلبات التجريبية مستبعدة"}
        actions={
          <Link href={qs({ test: includeTest ? undefined : "1" })} className="rounded-xl border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-brand-50">
            {includeTest ? "إخفاء البيانات التجريبية" : `إظهار البيانات التجريبية${totals.testPaidOrders ? ` (${totals.testPaidOrders})` : ""}`}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={<><span className="num">{filsToKwdString(totals.salesFils)}</span> <span className="text-sm text-muted">د.ك</span></>} icon={<Banknote />} />
        <StatCard label="الطلبات المدفوعة" value={<span className="num">{totals.paidOrders}</span>} hint={totals.pendingOrders ? `${totals.pendingOrders} بانتظار الدفع (آخر يومين)` : undefined} icon={<Receipt />} />
        <StatCard label="عدد الطلاب" value={<span className="num">{totals.students}</span>} icon={<Users />} />
        <StatCard label="المنتجات المنشورة" value={<span className="num">{totals.publishedProducts}</span>} icon={<FileText />} />
      </div>

      <Section
        title="المبيعات حسب الفترة"
        description="إجمالي الطلبات المدفوعة يوميًا بتوقيت الكويت"
        actions={
          <div className="flex gap-1 rounded-xl bg-canvas p-1" role="tablist" aria-label="الفترة">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={qs({ days: String(d) })}
                role="tab"
                aria-selected={d === days}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", d === days ? "bg-surface text-brand-700 shadow-sm" : "text-muted hover:text-ink")}
              >
                <span className="num">{d}</span> يوم
              </Link>
            ))}
          </div>
        }
      >
        <SalesBars data={series} />
        <p className="mt-3 text-sm text-muted">
          إجمالي الفترة: <span className="num font-bold text-ink">{filsToKwdString(series.reduce((s, d) => s + d.revenueFils, 0))}</span> د.ك ·{" "}
          <span className="num font-bold text-ink">{series.reduce((s, d) => s + d.orders, 0)}</span> طلب
        </p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="أحدث الطلبات" actions={<Link href="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">كل الطلبات</Link>}>
          {latest.length === 0 ? (
            <EmptyState icon={<Receipt />} title="لا توجد طلبات بعد" description="ستظهر هنا الطلبات فور إنشائها من الطلاب." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>الطلب</TH>
                  <TH>العميل</TH>
                  <TH>المبلغ</TH>
                  <TH>الحالة</TH>
                </tr>
              </THead>
              <tbody>
                {latest.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/admin/orders/${o.id}`} className="num font-semibold text-brand-700 hover:underline">
                        {o.number}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(o.created_at)}</p>
                    </TD>
                    <TD>{o.customer_name}</TD>
                    <TD>
                      <span className="num">{filsToKwdString(o.total_fils)}</span> د.ك
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.is_test ? <TestBadge /> : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
        <Section title="الأكثر مبيعًا" description="عدد المبيعات وقيمتها بسعر المنتج قبل الخصم">
          {top.length === 0 ? (
            <p className="rounded-xl bg-canvas p-6 text-center text-sm text-muted">لا توجد مبيعات مدفوعة بعد.</p>
          ) : (
            <ol className="space-y-3">
              {top.map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3">
                  <span className="num grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${p.product_id}`} className="line-clamp-1 text-sm font-semibold hover:text-brand-700">
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted">{PRODUCT_TYPE_LABELS[p.type as ProductType] ?? p.type}</p>
                  </div>
                  <div className="text-end text-sm">
                    <p className="num font-bold">{p.sold}</p>
                    <p className="text-xs text-muted">
                      <span className="num">{filsToKwdString(Number(p.revenue))}</span> د.ك
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}
