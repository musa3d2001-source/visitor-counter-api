/**
 * دليل مكوّنات لوحة التحكم (للتطوير فقط؛ مجلد lab يعيد 404 في الإنتاج).
 * الأرقام هنا بيانات توضيحية لعرض المكوّنات فقط، لا تُستخدم في أي صفحة حقيقية.
 * المكوّنات: src/components/admin/*
 */
import type { Metadata } from "next";
import { Banknote, BadgeCheck, FileText, Plus, Receipt, Trash2, Users } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { AdminPageHeader, AdminNotice, MoreLink, Section, StatGrid, StatTile, MiniStat, Panel } from "@/components/admin/page-header";
import { FilterBar, FilterSearch, FilterSubmit, ResultCount, Segmented, Toolbar } from "@/components/admin/filter-bar";
import { CellTitle, DataList, DataRow, InfoList, RankList } from "@/components/admin/data-list";
import { OrderStatusBadge, PaymentStatusBadge, ProductStatusBadge, StatusPill, TestBadge } from "@/components/admin/status-badge";
import { SalesBars } from "@/components/admin/sales-bars";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ToneIcon } from "@/components/admin/icon-tile";
import { ADMIN_TONES, type AdminTone } from "@/components/admin/tones";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ar, count, W } from "@/lib/design";

export const metadata: Metadata = { title: "مكوّنات لوحة التحكم" };

async function demoAction(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  "use server";
  return { ok: false, error: "هذا مثال توضيحي فقط." };
}

const DAYS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 5 + i));
  const v = [0, 2500, 0, 7000, 3500, 0, 0, 12500, 5000, 2500][i % 10];
  return { day: d.toISOString().slice(0, 10), orders: v ? Math.ceil(v / 3000) : 0, revenueFils: v };
});

export default function AdminKitPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto max-w-[84rem] space-y-10 px-4 py-10 sm:px-6 lg:px-10">
        <p className="rounded-2xl bg-warning-50 p-3 text-center font-display text-sm font-bold text-warning">صفحة تطوير: الأرقام توضيحية لعرض المكوّنات فقط.</p>

        <AdminPageHeader
          title="المحتوى والمنتجات"
          description="الفيديوهات والمذكرات والباقات، الأسعار والظهور والمراجعة"
          icon={<FileText />}
          tone="sky"
          crumbs={[{ label: "المحتوى", href: "#" }, { label: "مثال" }]}
          actions={
            <>
              <Button variant="outline">تصدير</Button>
              <Button>
                <Plus aria-hidden /> إضافة منتج
              </Button>
            </>
          }
        />

        <AdminNotice href="#" icon={<BadgeCheck />} action="مراجعة الآن">
          يوجد {count(3, W.product)} بانتظار المراجعة والاعتماد
        </AdminNotice>

        <StatGrid>
          <StatTile label="إجمالي المبيعات" icon={<Banknote />} value={<><span className="num">128.500</span> <span className="text-sm text-muted">د.ك</span></>} delta={{ value: "+١٢٪", trend: "up" }} />
          <StatTile label="الطلبات المدفوعة" icon={<Receipt />} value={ar(42)} hint={`${count(2, W.order)} بانتظار الدفع`} />
          <StatTile label="عدد الطلاب" icon={<Users />} value={ar(318)} href="#" />
          <StatTile label="المنتجات المنشورة" icon={<FileText />} value={ar(96)} delta={{ value: "بلا تغيير", trend: "flat" }} />
        </StatGrid>

        <Section
          title="المبيعات حسب الفترة"
          description="إجمالي الطلبات المدفوعة يوميًا بتوقيت الكويت"
          icon={<Banknote />}
          tone="gold"
          actions={<Segmented label="الفترة" items={[7, 30, 90].map((d) => ({ href: "#", label: count(d, W.day), active: d === 30 }))} />}
        >
          <SalesBars data={DAYS} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MiniStat label="إجمالي الفترة" value={<><span className="num">93.000</span> <span className="text-sm text-muted">د.ك</span></>} />
            <MiniStat label="عدد الطلبات" value={ar(33)} />
            <MiniStat label="مسترد" value={ar(1)} />
          </div>
        </Section>
        <Section title="فارغ" description="SalesBars بلا بيانات">
          <SalesBars data={DAYS.map((d) => ({ ...d, revenueFils: 0, orders: 0 }))} />
        </Section>

        <FilterBar>
          <FilterSearch placeholder="ابحث بالعنوان أو الرابط" />
          <Select name="grade" aria-label="الصف" defaultValue="">
            <option value="">كل الصفوف</option>
          </Select>
          <Select name="type" aria-label="النوع" defaultValue="">
            <option value="">كل الأنواع</option>
          </Select>
          <Select name="status" aria-label="الحالة" defaultValue="">
            <option value="">كل الحالات</option>
          </Select>
          <FilterSubmit resetHref="#" active />
        </FilterBar>

        <Section title="أحدث الطلبات" icon={<Receipt />} tone="green" flush actions={<MoreLink href="#">كل الطلبات</MoreLink>}>
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
              {["paid", "pending", "failed", "refunded", "cancelled"].map((s, i) => (
                <TR key={s}>
                  <TD>
                    <CellTitle href="#" title={<span className="num">ORD-10000{i}</span>} sub="2026/11/03 1:49 ص" />
                  </TD>
                  <TD>سارة الطالبة</TD>
                  <TD>
                    <span className="num font-bold">7.000</span> د.ك
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <OrderStatusBadge status={s} />
                      {i === 1 ? <TestBadge /> : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section title="الأكثر مبيعًا" description="عدد المبيعات وقيمتها">
            <RankList
              items={["المذكرة النهائية: الرياضيات", "مراجعة ليلة الاختبار: العلوم", "الباقة الشاملة: الصف التاسع", "الدورة الكاملة: الإنجليزية"].map((t, i) => ({
                key: t,
                href: "#",
                title: t,
                sub: "مذكرة نهائية",
                value: ar(9 - i * 2),
                valueSub: <><span className="num">{(6 - i).toFixed(3)}</span> د.ك</>,
              }))}
            />
          </Section>
          <Section title="تفاصيل الطلب" headingLevel={2}>
            <InfoList
              items={[
                { label: "رقم الطلب", value: <span className="num">ORD-100009</span> },
                { label: "الحالة", value: <OrderStatusBadge status="paid" /> },
                { label: "العميل", value: "سارة الطالبة" },
                { label: "الدفع", value: <PaymentStatusBadge status="paid" /> },
                { label: "ملاحظة", value: "مثال لنص أطول يمتد على عرض اللوح كاملًا.", wide: true },
              ]}
            />
          </Section>
        </div>

        <Section title="قائمة بطاقات (بديل الجدول)">
          <DataList>
            {(["published", "draft", "in_review", "hidden", "archived"] as const).map((s) => (
              <DataRow
                key={s}
                href="#"
                leading={
                  <ToneIcon tone="sky" size="sm">
                    <FileText />
                  </ToneIcon>
                }
                title="المذكرة النهائية لمادة اللغة العربية"
                sub="الصف السادس · اللغة العربية"
                badges={<ProductStatusBadge status={s} />}
                aside={<span className="num font-display font-black">3.000 د.ك</span>}
              />
            ))}
          </DataList>
        </Section>

        <Panel>
          <Toolbar start={<ResultCount>{count(96, W.product)}</ResultCount>} end={<StatusPill tone="info">مثال</StatusPill>} />
          <div className="flex flex-wrap gap-3">
            {(Object.keys(ADMIN_TONES) as AdminTone[]).map((t) => (
              <ToneIcon key={t} tone={t}>
                <FileText />
              </ToneIcon>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ConfirmButton action={demoAction} label="حذف" icon={<Trash2 aria-hidden />} title="حذف المنتج نهائيًا؟" description="لا يمكن التراجع عن هذا الإجراء." requireReason />
            <ConfirmButton action={demoAction} label="اعتماد" variant="primary" title="اعتماد ونشر المحتوى؟" selectField={{ name: "x", label: "الصف", options: [{ value: "1", label: "الصف السادس" }] }} />
          </div>
        </Panel>
        <Panel variant="night" className="text-white">
          <p className="font-display text-lg font-black">لوح داكن (Panel variant=&quot;night&quot;)</p>
        </Panel>
      </main>
    </div>
  );
}
