import Link from "next/link";
import { Receipt, Search } from "lucide-react";
import { listAdminOrders } from "@/server/admin/records";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OrderStatusBadge, PaymentStatusBadge, TestBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "الطلبات والمدفوعات" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; test?: string }> }) {
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp.status as never) ? sp.status : undefined;
  const test = sp.test === "real" || sp.test === "test" ? sp.test : undefined;
  const orders = await listAdminOrders({ q: sp.q?.slice(0, 80), status, test });
  const filtered = Boolean(sp.q || status || test);
  return (
    <div>
      <AdminPageHeader title="الطلبات والمدفوعات" description="كل الطلبات مع حالة الدفع. الطلبات التجريبية (Sandbox) مميزة بشارة." />
      <form className="mb-5 grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[2fr_1fr_1fr_auto]" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="رقم الطلب أو البريد أو الاسم" className="ps-9" aria-label="بحث" />
        </div>
        <Select name="status" defaultValue={status ?? ""} aria-label="الحالة">
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select name="test" defaultValue={test ?? ""} aria-label="النوع">
          <option value="">حقيقية وتجريبية</option>
          <option value="real">حقيقية فقط</option>
          <option value="test">تجريبية فقط</option>
        </Select>
        <Button type="submit" variant="secondary">
          تصفية
        </Button>
      </form>
      {orders.length === 0 ? (
        <EmptyState icon={<Receipt />} title={filtered ? "لا توجد طلبات مطابقة" : "لا توجد طلبات بعد"} description={filtered ? "جرّب تغيير معايير البحث." : "ستظهر هنا طلبات الطلاب فور إنشائها."} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>رقم الطلب</TH>
              <TH>التاريخ</TH>
              <TH>العميل</TH>
              <TH>المنتجات</TH>
              <TH>الإجمالي</TH>
              <TH>حالة الطلب</TH>
              <TH>آخر دفع</TH>
            </tr>
          </THead>
          <tbody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link href={`/admin/orders/${o.id}`} className="num font-semibold text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                </TD>
                <TD className="text-xs text-muted">{formatDateTime(o.created_at)}</TD>
                <TD>
                  <p className="font-semibold">{o.customer_name}</p>
                  <p className="text-xs text-muted" dir="ltr">
                    {o.customer_email}
                  </p>
                </TD>
                <TD className="num">{o.item_count}</TD>
                <TD className="whitespace-nowrap">
                  <span className="num font-semibold">{filsToKwdString(o.total_fils)}</span> د.ك
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <OrderStatusBadge status={o.status} />
                    {o.is_test ? <TestBadge /> : null}
                  </div>
                </TD>
                <TD>{o.last_payment_status ? <PaymentStatusBadge status={o.last_payment_status} /> : <span className="text-xs text-muted">—</span>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
