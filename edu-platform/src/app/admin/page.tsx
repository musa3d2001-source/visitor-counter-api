import Link from "next/link";
import { BadgeCheck, Banknote, FileText, GraduationCap, Receipt, Users, Wallet } from "lucide-react";
import { dashboardTotals, latestOrders, salesByDay, topProducts, topTeachers } from "@/server/admin/stats";
import { requireStaff, type Actor } from "@/server/auth/permissions";
import { pendingReviewCount } from "@/server/admin/products";
import { teacherDashboard } from "@/server/admin/teachers";
import { Button } from "@/components/ui/button";
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
  const actor = await requireStaff();
  if (actor.kind === "teacher") return <TeacherHome actor={actor} />;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const includeTest = sp.test === "1";
  const [totals, latest, top, series, pending, teachersTop] = await Promise.all([
    dashboardTotals(includeTest),
    latestOrders(8, includeTest),
    topProducts(6, includeTest),
    salesByDay(days, includeTest),
    pendingReviewCount(),
    topTeachers(days, includeTest),
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
        description={includeTest ? "تشمل الأرقام الطلبات التجريبية (Sandbox)" : "الأرقام من الطلبات الحقيقية فقط، الطلبات التجريبية مستبعدة"}
        actions={
          <Link href={qs({ test: includeTest ? undefined : "1" })} className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-brand-50">
            {includeTest ? "إخفاء البيانات التجريبية" : `إظهار البيانات التجريبية${totals.testPaidOrders ? ` (${totals.testPaidOrders})` : ""}`}
          </Link>
        }
      />

      {pending > 0 ? (
        <Link href="/admin/review" className="flex items-center gap-3 rounded-lg border-2 border-accent-200 bg-accent-50 p-4 font-semibold hover:bg-accent-100">
          <BadgeCheck className="size-5 text-accent-700" aria-hidden />
          <span className="flex-1">
            يوجد <span className="num">{pending}</span> محتوى بانتظار المراجعة والاعتماد
          </span>
          <span className="text-sm text-brand-700">مراجعة الآن</span>
        </Link>
      ) : null}

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
          <div className="flex gap-1 rounded-lg bg-mist p-1" role="tablist" aria-label="الفترة">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={qs({ days: String(d) })}
                role="tab"
                aria-selected={d === days}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", d === days ? "bg-surface text-brand-700" : "text-muted hover:text-ink")}
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

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
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
            <p className="rounded-lg bg-mist p-6 text-center text-sm text-muted">لا توجد مبيعات مدفوعة بعد.</p>
          ) : (
            <ol className="space-y-3">
              {top.map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3">
                  <span className="num w-6 shrink-0 text-center font-display text-[1.6rem] leading-none font-medium text-brand-700">{i + 1}</span>
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

      <Section title="المبيعات حسب المعلم" description={`آخر ${days} يومًا، قيمة عناصر الطلبات المدفوعة المنسوبة لكل معلم`} actions={<Link href="/admin/teachers" className="text-sm font-semibold text-brand-700 hover:underline">كل المعلمين</Link>}>
        {teachersTop.length === 0 ? (
          <p className="rounded-lg bg-mist p-6 text-center text-sm text-muted">لا توجد مبيعات لمحتوى المعلمين في هذه الفترة.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teachersTop.map((t, i) => (
              <li key={t.teacherId} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <span className="num w-6 shrink-0 text-center font-display text-[1.6rem] leading-none font-medium text-brand-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/teachers/${t.teacherId}`} className="line-clamp-1 text-sm font-semibold hover:text-brand-700">
                    {t.teacherName}
                  </Link>
                  <p className="text-xs text-muted">
                    <span className="num">{t.sold}</span> عملية بيع
                  </p>
                </div>
                <p className="num text-sm font-bold">{filsToKwdString(t.revenueFils)}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

/** الصفحة الرئيسية للمعلم: أرقامه فقط — بدون بيانات الطلاب */
async function TeacherHome({ actor }: { actor: Extract<Actor, { kind: "teacher" }> }) {
  const d = await teacherDashboard(actor.teacherId);
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`أهلًا ${actor.teacherName}`}
        description="ملخص محتواك ومبيعاته"
        actions={
          actor.canUpload ? (
            <Button asChild>
              <Link href="/admin/products/new">إضافة محتوى</Link>
            </Button>
          ) : null
        }
      />
      {!actor.canUpload ? <p className="rounded-lg bg-warning-50 p-4 text-sm font-semibold text-warning">صلاحية رفع المحتوى موقوفة حاليًا، تواصل مع إدارة المنصة.</p> : null}
      {d.returned.length ? (
        <Section title="محتوى أُعيد إليك للتعديل">
          <ul className="space-y-2">
            {d.returned.map((r) => (
              <li key={r.id} className="rounded-lg border border-warning/30 bg-warning-50 p-3 text-sm">
                <Link href={`/admin/products/${r.id}`} className="font-semibold hover:underline">
                  {r.title}
                </Link>
                <p className="mt-1 text-ink-soft">{r.review_note}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="منشور" value={<span className="num">{d.counts.published}</span>} icon={<FileText />} />
        <StatCard label="بانتظار المراجعة" value={<span className="num">{d.counts.in_review}</span>} icon={<BadgeCheck />} />
        <StatCard label="مسودات" value={<span className="num">{d.counts.draft}</span>} icon={<GraduationCap />} />
        <StatCard label="عمليات بيع" value={<span className="num">{d.summary.items}</span>} hint={`${filsToKwdString(d.summary.grossFils)} د.ك`} icon={<Banknote />} />
      </div>
      {d.balance.earnedFils > 0 || d.balance.paidFils > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard label="أرباحي المستحقة" value={<><span className="num">{filsToKwdString(d.balance.earnedFils)}</span> <span className="text-sm text-muted">د.ك</span></>} icon={<Wallet />} />
          <StatCard label="الرصيد غير المسدد" value={<><span className="num">{filsToKwdString(d.balance.balanceFils)}</span> <span className="text-sm text-muted">د.ك</span></>} icon={<Wallet />} />
        </div>
      ) : null}
      <Section title="آخر مبيعات محتواك" actions={<Link href="/admin/earnings" className="text-sm font-semibold text-brand-700 hover:underline">التفاصيل</Link>}>
        {d.latest.length === 0 ? (
          <EmptyState icon={<Receipt />} title="لا توجد مبيعات بعد" description="عند شراء الطلاب لمحتواك ستظهر العمليات هنا." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>الطلب</TH>
                <TH>التاريخ</TH>
                <TH>المحتوى</TH>
                <TH>القيمة</TH>
              </tr>
            </THead>
            <tbody>
              {d.latest.map((s, i) => (
                <TR key={`${s.order_number}-${i}`}>
                  <TD className="num font-semibold">{s.order_number}</TD>
                  <TD className="text-xs text-muted">{formatDateTime(s.paid_at)}</TD>
                  <TD className="text-xs">{s.title}</TD>
                  <TD className="num">{filsToKwdString(s.unit_price_fils)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
