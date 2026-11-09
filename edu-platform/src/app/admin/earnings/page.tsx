import { notFound, redirect } from "next/navigation";
import { Banknote, FileText, FlaskConical, HandCoins, Info, Percent, Receipt, Wallet } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { sql } from "@/server/db";
import { listEarnings, listPayouts, saleLines, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { AdminPageHeader, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { CellTitle, DataList, DataRow } from "@/components/admin/data-list";
import { ToneIcon } from "@/components/admin/icon-tile";
import { StatusPill } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ar, count } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";
import { Kwd, PAYOUT, SALE } from "../_components/overview/money";

export const metadata = { title: "أرباحي ومبيعاتي" };

const METHOD_LABELS: Record<string, string> = { bank_transfer: "تحويل بنكي", cash: "نقدًا", other: "أخرى" };

/** صفحة المعلم: مبيعاته وأرباحه فقط — بدون أي بيانات للطلاب أو لمعلمين آخرين */
export default async function TeacherEarningsPage({ searchParams }: { searchParams: Promise<{ test?: string }> }) {
  const actor = await requireStaff();
  const includeTest = (await searchParams).test === "1";
  if (actor.kind === "owner") redirect("/admin/teachers");
  if (actor.kind !== "teacher") notFound();
  const teacherId = actor.teacherId;
  const [[t], summary, balance, earnings, payouts, sales] = await Promise.all([
    sql<{ revenue_share_bps: number | null }[]>`select revenue_share_bps from teachers where id = ${teacherId}`,
    teacherSalesSummary(teacherId, { includeTest }),
    teacherBalance(teacherId, { includeTest }),
    listEarnings(teacherId, { includeTest, limit: 200 }),
    listPayouts(teacherId),
    sql<{ order_number: string; paid_at: Date; title: string; unit_price_fils: number; status: string }[]>`
      select o.number as order_number, o.paid_at, l.title, l.gross_fils as unit_price_fils, o.status
      from ${saleLines()} l join orders o on o.id = l.order_id
      where l.teacher_id = ${teacherId} and o.status in ('paid', 'refunded') and (${includeTest} or not o.is_test)
      order by o.paid_at desc limit 100
    `,
  ]);
  const shareOn = t?.revenue_share_bps !== null && t?.revenue_share_bps !== undefined;
  const sharePct = shareOn ? ar(String(t!.revenue_share_bps! / 100)) : null;

  return (
    <div className="space-y-6">
      <PageBand tone="gold" art="coins">
        <AdminPageHeader
          title="أرباحي ومبيعاتي"
          description={includeTest ? "تشمل الطلبات التجريبية (بيئة الاختبار)، لا تُحتسب ضمن المستحقات الفعلية" : "مبيعات محتواك المدفوعة (الطلبات التجريبية مستبعدة)"}
          actions={
            <Button asChild variant="outline" size="sm">
              <a href={includeTest ? "/admin/earnings" : "/admin/earnings?test=1"}>
                <FlaskConical aria-hidden />
                {includeTest ? "إخفاء البيانات التجريبية" : "إظهار البيانات التجريبية"}
              </a>
            </Button>
          }
          className="mb-0"
        >
          {sharePct ? (
            <span className="chip chip-white min-h-9 px-3.5 text-[0.88rem]">
              <Percent className="text-[#C98500]" aria-hidden /> نسبتي {sharePct}٪ من صافي كل بيع
            </span>
          ) : null}
        </AdminPageHeader>
      </PageBand>

      <StatGrid>
        <StatTile label="عمليات بيع" value={<span className="num">{ar(summary.items)}</span>} icon={<FileText />} />
        <StatTile label="قيمة المبيعات" value={<Kwd fils={summary.grossFils} />} icon={<Banknote />} />
        {shareOn ? (
          <>
            <StatTile label="أرباحي المستحقة" value={<Kwd fils={balance.earnedFils} />} hint={`نسبتي ${sharePct}٪ من الصافي`} icon={<Wallet />} />
            <StatTile
              label="الرصيد غير المسدد"
              value={<Kwd fils={balance.balanceFils} />}
              hint={
                <>
                  المسدد: <span className="num">{filsToKwdString(balance.paidFils)}</span> د.ك
                </>
              }
              icon={<HandCoins />}
              tone="teal"
            />
          </>
        ) : null}
      </StatGrid>

      {!shareOn ? (
        <p className="flex items-center gap-3 rounded-[1.4rem] border-2 border-sky/20 bg-sky-50 p-4 font-display text-[0.95rem] font-bold text-sky-700">
          <ToneIcon tone="sky" size="sm">
            <Info />
          </ToneIcon>
          لم يُفعَّل احتساب الأرباح لحسابك بعد. تواصل مع إدارة المنصة.
        </p>
      ) : null}

      {shareOn ? (
        <Section title="تفاصيل الأرباح" description="الصافي = قيمة البيع − حصته من الخصم − الرسوم المعتمدة. المستردات تُعكس تلقائيًا." icon={<Wallet />} tone="gold" flush>
          {earnings.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState art="receipt" compact title="لا توجد أرباح بعد." />
            </div>
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
                      <span className="num font-display font-extrabold text-ink">{e.order_number}</span>
                      <p className="text-xs whitespace-nowrap text-muted">{formatDate(e.created_at)}</p>
                    </TD>
                    <TD className="max-w-60">
                      <CellTitle title={e.product_title} sub={e.bundle_title ? `ضمن «${e.bundle_title}»` : undefined} />
                    </TD>
                    <TD className="num">{filsToKwdString(e.gross_fils)}</TD>
                    <TD className="num text-muted">{filsToKwdString(e.discount_fils)}</TD>
                    <TD className="num text-muted">{filsToKwdString(e.fee_fils)}</TD>
                    <TD className="num">{filsToKwdString(e.net_fils)}</TD>
                    <TD>
                      <span className="num inline-flex min-h-8 items-center rounded-full bg-[#FFF4D6] px-3 font-display font-black text-[#8A5A00]">{filsToKwdString(e.teacher_fils)}</span>
                    </TD>
                    <TD>{e.status === "reversed" ? <StatusPill tone="danger">معكوس (استرداد)</StatusPill> : <StatusPill tone="success">مستحق</StatusPill>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      ) : (
        <Section title="آخر المبيعات" icon={<Receipt />} tone="green">
          {sales.length === 0 ? (
            <EmptyState art="receipt" compact title="لا توجد مبيعات بعد." />
          ) : (
            <DataList>
              {sales.map((s, i) => (
                <DataRow
                  key={`${s.order_number}-${i}`}
                  leading={
                    <ToneIcon tone={s.status === "refunded" ? "violet" : "green"} size="sm">
                      <Receipt />
                    </ToneIcon>
                  }
                  title={s.title}
                  sub={
                    <>
                      <span className="num whitespace-nowrap">{s.order_number}</span> · <span className="whitespace-nowrap">{formatDateTime(s.paid_at)}</span>
                    </>
                  }
                  aside={
                    <div className="flex items-center gap-2">
                      {s.status === "refunded" ? <StatusPill tone="danger">مسترد</StatusPill> : null}
                      <Kwd fils={s.unit_price_fils} className="font-display text-[1.05rem] font-black text-ink" />
                    </div>
                  }
                />
              ))}
            </DataList>
          )}
          {sales.length ? <p className="mt-4 text-[0.82rem] text-muted">{count(sales.length, SALE)} معروضة، الأحدث أولًا.</p> : null}
        </Section>
      )}

      {shareOn ? (
        <Section
          title="التسويات المستلمة"
          description={payouts.length ? count(payouts.length, PAYOUT) : undefined}
          icon={<HandCoins />}
          tone="green"
        >
          {payouts.length === 0 ? (
            <EmptyState art="receipt" compact title="لا توجد تسويات بعد." />
          ) : (
            <DataList>
              {payouts.map((p) => (
                <DataRow
                  key={p.id}
                  leading={
                    <ToneIcon tone="green" size="sm">
                      <HandCoins />
                    </ToneIcon>
                  }
                  title={<Kwd fils={p.amount_fils} className="text-[1.1rem]" />}
                  sub={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                      {p.reference ? (
                        <span className="num text-xs" dir="ltr">
                          {p.reference}
                        </span>
                      ) : null}
                    </span>
                  }
                  aside={<span className="text-xs whitespace-nowrap text-muted">{formatDateTime(p.paid_at)}</span>}
                />
              ))}
            </DataList>
          )}
        </Section>
      ) : null}
    </div>
  );
}
