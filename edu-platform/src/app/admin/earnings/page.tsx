import { notFound, redirect } from "next/navigation";
import { Banknote, FileText, Wallet } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { sql } from "@/server/db";
import { listEarnings, listPayouts, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { AdminPageHeader, Section, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "أرباحي ومبيعاتي" };

const METHOD_LABELS: Record<string, string> = { bank_transfer: "تحويل بنكي", cash: "نقدًا", other: "أخرى" };

/** صفحة المعلم: مبيعاته وأرباحه فقط — بدون أي بيانات للطلاب أو لمعلمين آخرين */
export default async function TeacherEarningsPage() {
  const actor = await requireStaff();
  if (actor.kind === "owner") redirect("/admin/teachers");
  if (actor.kind !== "teacher") notFound();
  const teacherId = actor.teacherId;
  const [[t], summary, balance, earnings, payouts, sales] = await Promise.all([
    sql<{ revenue_share_bps: number | null }[]>`select revenue_share_bps from teachers where id = ${teacherId}`,
    teacherSalesSummary(teacherId),
    teacherBalance(teacherId),
    listEarnings(teacherId, { limit: 200 }),
    listPayouts(teacherId),
    sql<{ order_number: string; paid_at: Date; title: string; unit_price_fils: number; status: string }[]>`
      select o.number as order_number, o.paid_at, oi.title, oi.unit_price_fils, o.status
      from order_items oi join orders o on o.id = oi.order_id
      where oi.teacher_id = ${teacherId} and o.status in ('paid', 'refunded') and not o.is_test
      order by o.paid_at desc limit 100
    `,
  ]);
  const shareOn = t?.revenue_share_bps !== null && t?.revenue_share_bps !== undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="أرباحي ومبيعاتي" description="مبيعات محتواك المدفوعة (الطلبات التجريبية مستبعدة)" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="عمليات بيع" value={<span className="num">{summary.items}</span>} icon={<FileText />} />
        <StatCard label="قيمة المبيعات" value={<><span className="num">{filsToKwdString(summary.grossFils)}</span> <span className="text-sm text-muted">د.ك</span></>} icon={<Banknote />} />
        {shareOn ? (
          <>
            <StatCard label="أرباحي المستحقة" value={<><span className="num">{filsToKwdString(balance.earnedFils)}</span> <span className="text-sm text-muted">د.ك</span></>} hint={`نسبتي ${t!.revenue_share_bps! / 100}% من الصافي`} icon={<Wallet />} />
            <StatCard label="الرصيد غير المسدد" value={<><span className="num">{filsToKwdString(balance.balanceFils)}</span> <span className="text-sm text-muted">د.ك</span></>} hint={`المسدد: ${filsToKwdString(balance.paidFils)} د.ك`} icon={<Wallet />} />
          </>
        ) : null}
      </div>
      {!shareOn ? <p className="rounded-xl bg-canvas p-4 text-sm text-muted">لم يُفعَّل احتساب الأرباح لحسابك بعد. تواصل مع إدارة المنصة.</p> : null}

      {shareOn ? (
        <Section title="تفاصيل الأرباح" description="الصافي = قيمة البيع − حصته من الخصم − الرسوم المعتمدة. المستردات تُعكس تلقائيًا.">
          {earnings.length === 0 ? (
            <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد أرباح بعد.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>الطلب</TH>
                  <TH>المحتوى</TH>
                  <TH>القيمة</TH>
                  <TH>الخصم</TH>
                  <TH>الرسوم</TH>
                  <TH>الصافي</TH>
                  <TH>حصتي</TH>
                  <TH>الحالة</TH>
                </tr>
              </THead>
              <tbody>
                {earnings.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <span className="num font-semibold">{e.order_number}</span>
                      <p className="text-xs text-muted">{formatDate(e.created_at)}</p>
                    </TD>
                    <TD className="max-w-56 text-xs">{e.product_title}</TD>
                    <TD className="num">{filsToKwdString(e.gross_fils)}</TD>
                    <TD className="num text-muted">{filsToKwdString(e.discount_fils)}</TD>
                    <TD className="num text-muted">{filsToKwdString(e.fee_fils)}</TD>
                    <TD className="num">{filsToKwdString(e.net_fils)}</TD>
                    <TD className="num font-semibold">{filsToKwdString(e.teacher_fils)}</TD>
                    <TD>{e.status === "reversed" ? <Badge tone="danger">معكوس (استرداد)</Badge> : <Badge tone="success">مستحق</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      ) : (
        <Section title="آخر المبيعات">
          {sales.length === 0 ? (
            <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد مبيعات بعد.</p>
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
                {sales.map((s, i) => (
                  <TR key={`${s.order_number}-${i}`}>
                    <TD className="num font-semibold">{s.order_number}</TD>
                    <TD className="text-xs text-muted">{formatDateTime(s.paid_at)}</TD>
                    <TD className="text-xs">{s.title}</TD>
                    <TD className="num">
                      {filsToKwdString(s.unit_price_fils)} {s.status === "refunded" ? <Badge tone="danger">مسترد</Badge> : null}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      )}

      {shareOn ? (
        <Section title="التسويات المستلمة">
          {payouts.length === 0 ? (
            <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد تسويات بعد.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {payouts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                  <span className="num font-bold">{filsToKwdString(p.amount_fils)} د.ك</span>
                  <span className="text-muted">{METHOD_LABELS[p.method] ?? p.method}</span>
                  {p.reference ? <span className="num text-xs text-muted" dir="ltr">{p.reference}</span> : null}
                  <span className="ms-auto text-xs text-muted">{formatDateTime(p.paid_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}
