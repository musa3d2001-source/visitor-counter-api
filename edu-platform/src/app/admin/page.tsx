import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  ChartColumn,
  Clock,
  Crown,
  FileText,
  FlaskConical,
  GraduationCap,
  MailWarning,
  Plus,
  Receipt,
  RotateCcw,
  Settings,
  ShieldAlert,
  Ticket,
  Trophy,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { dashboardTotals, latestOrders, salesByDay, topProducts, topTeachers } from "@/server/admin/stats";
import { requireStaff, type Actor } from "@/server/auth/permissions";
import { pendingReviewCount } from "@/server/admin/products";
import { teacherDashboard } from "@/server/admin/teachers";
import { openPaymentAlertCount } from "@/server/payments/monitoring";
import { extraPaymentsNeedingOwnerCount } from "@/server/payments/extras";
import { refundsNeedingOwnerCount } from "@/server/payments/refunds";
import { mailHealth } from "@/server/platform/mail-status";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/section-head";
import { AdminNotice, MiniStat, MoreLink, Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { DataList, DataRow, RankList } from "@/components/admin/data-list";
import { Segmented } from "@/components/admin/filter-bar";
import { ToneIcon } from "@/components/admin/icon-tile";
import { SalesBars } from "@/components/admin/sales-bars";
import { OrderStatusBadge, StatusPill, TestBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ar, count, W } from "@/lib/design";
import { PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { DashHero, HeroChip } from "./_components/overview/bands";
import { ALERT, EXTRA_PAYMENT, Kwd, CONTENT, MAIL_MESSAGE, REFUND, SALE, todayLabel } from "./_components/overview/money";
import { QuickTiles } from "./_components/overview/quick-tiles";

export const metadata = { title: "الرئيسية" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ days?: string; test?: string }> }) {
  const actor = await requireStaff();
  if (actor.kind === "teacher") return <TeacherHome actor={actor} />;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const includeTest = sp.test === "1";
  const [totals, latest, top, series, pending, teachersTop, paymentAlerts, extraPayments, refundsWaiting, mail] = await Promise.all([
    dashboardTotals(includeTest),
    latestOrders(8, includeTest),
    topProducts(6, includeTest),
    salesByDay(days, includeTest),
    pendingReviewCount(),
    topTeachers(days, includeTest),
    openPaymentAlertCount(),
    extraPaymentsNeedingOwnerCount(),
    refundsNeedingOwnerCount(),
    mailHealth(),
  ]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ ...(sp.days ? { days: sp.days } : {}), ...(includeTest ? { test: "1" } : {}) });
    for (const [k, v] of Object.entries(patch)) (v === undefined ? p.delete(k) : p.set(k, v));
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  const periodFils = series.reduce((s, d) => s + d.revenueFils, 0);
  const periodOrders = series.reduce((s, d) => s + d.orders, 0);
  const today = todayLabel();

  return (
    <div className="space-y-6">
      <DashHero
        eyebrow={
          <>
            <Eyebrow tone="light" icon={<Crown aria-hidden />}>
              لوحة المالك
            </Eyebrow>
            {today ? <HeroChip icon={<CalendarDays aria-hidden />}>{today}</HeroChip> : null}
          </>
        }
        greeting="أهلًا،"
        name={actor.name}
        sub={includeTest ? "تشمل الأرقام الطلبات التجريبية (Sandbox)" : "الأرقام من الطلبات الحقيقية فقط، الطلبات التجريبية مستبعدة"}
        chips={
          totals.pendingOrders || includeTest ? (
            <>
              {totals.pendingOrders ? <HeroChip icon={<Clock aria-hidden />}>{count(totals.pendingOrders, W.order)} بانتظار الدفع (آخر يومين)</HeroChip> : null}
              {includeTest ? <HeroChip icon={<FlaskConical aria-hidden />}>وضع عرض البيانات التجريبية</HeroChip> : null}
            </>
          ) : null
        }
        actions={
          <>
            <Button asChild variant="accent" size="lg">
              <Link href="/admin/products/new">
                <Plus aria-hidden /> إضافة منتج
              </Link>
            </Button>
            <Button asChild variant="light" size="md">
              <Link href={qs({ test: includeTest ? undefined : "1" })}>
                <FlaskConical aria-hidden />
                {includeTest ? "إخفاء البيانات التجريبية" : `إظهار البيانات التجريبية${totals.testPaidOrders ? ` (${ar(totals.testPaidOrders)})` : ""}`}
              </Link>
            </Button>
          </>
        }
      />

      {mail.logOnlyInProduction ? (
        <AdminNotice href="/admin/mail" icon={<MailWarning />} tone="coral" action="التفاصيل">
          البريد غير مفعّل: لا تصل أي رسالة إلى الطلاب، ولا تعمل استعادة كلمة المرور عبر البريد
        </AdminNotice>
      ) : null}

      {mail.failedRecently > 0 ? (
        <AdminNotice href="/admin/mail" icon={<MailWarning />} tone="coral" action="عرض القائمة">
          تعذر إرسال {count(mail.failedRecently, MAIL_MESSAGE)} خلال آخر {ar(mail.recentDays)} أيام
        </AdminNotice>
      ) : null}

      {paymentAlerts > 0 ? (
        <AdminNotice href="/admin/orders#payment-alerts" icon={<ShieldAlert />} tone="coral" action="عرض التنبيهات">
          لديك {count(paymentAlerts, ALERT)} بخصوص المدفوعات بانتظار مراجعتك
        </AdminNotice>
      ) : null}

      {extraPayments > 0 ? (
        <AdminNotice href="/admin/orders#extra-payments" icon={<Banknote />} tone="coral" action="عرض الدفعات">
          لديك {count(extraPayments, EXTRA_PAYMENT)} بانتظار قرارك
        </AdminNotice>
      ) : null}

      {refundsWaiting > 0 ? (
        <AdminNotice href="/admin/orders#refund-queue" icon={<RotateCcw />} tone="coral" action="عرض الاستردادات">
          لديك {count(refundsWaiting, REFUND)} بانتظار قرارك
        </AdminNotice>
      ) : null}

      {pending > 0 ? (
        <AdminNotice href="/admin/review" icon={<BadgeCheck />} action="مراجعة الآن">
          يوجد {count(pending, CONTENT)} بانتظار المراجعة والاعتماد
        </AdminNotice>
      ) : null}

      <StatGrid>
        <StatTile label="إجمالي المبيعات" value={<Kwd fils={totals.salesFils} />} icon={<Banknote />} href="/admin/reports" />
        <StatTile
          label="الطلبات المدفوعة"
          value={<span className="num">{ar(totals.paidOrders)}</span>}
          hint={totals.pendingOrders ? `${count(totals.pendingOrders, W.order)} بانتظار الدفع` : undefined}
          icon={<Receipt />}
          href="/admin/orders"
        />
        <StatTile label="عدد الطلاب" value={<span className="num">{ar(totals.students)}</span>} icon={<Users />} href="/admin/students" />
        <StatTile label="المنتجات المنشورة" value={<span className="num">{ar(totals.publishedProducts)}</span>} icon={<FileText />} href="/admin/products" />
      </StatGrid>

      <QuickTiles
        items={[
          { href: "/admin/products/new", label: "منتج جديد", sub: "فيديو أو مذكرة أو باقة", icon: <Plus />, tone: "sky" },
          { href: "/admin/review", label: "مراجعة المحتوى", sub: pending ? count(pending, CONTENT) : "لا شيء بالانتظار", icon: <BadgeCheck />, tone: "gold", badge: pending ? ar(pending) : undefined },
          { href: "/admin/orders", label: "الطلبات", sub: "الدفع والاسترداد", icon: <Receipt />, tone: "green" },
          { href: "/admin/coupons", label: "الكوبونات", sub: "خصومات وعروض", icon: <Ticket />, tone: "coral" },
          { href: "/admin/reports", label: "التقارير", sub: "تصدير وتحليل", icon: <ChartColumn />, tone: "violet" },
          { href: "/admin/settings", label: "الإعدادات", sub: "الهوية والتواصل", icon: <Settings />, tone: "slate" },
        ]}
      />

      <Section
        title="المبيعات حسب الفترة"
        description="إجمالي الطلبات المدفوعة يوميًا بتوقيت الكويت"
        icon={<ChartColumn />}
        tone="teal"
        actions={<Segmented label="الفترة" items={[7, 30, 90].map((d) => ({ href: qs({ days: String(d) }), label: count(d, W.day), active: d === days }))} />}
      >
        <SalesBars data={series} />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="إجمالي الفترة" tone="teal" value={<Kwd fils={periodFils} />} />
          <MiniStat label="عدد الطلبات" tone="green" value={<span className="num">{ar(periodOrders)}</span>} />
          {periodOrders > 0 ? (
            <MiniStat label="متوسط قيمة الطلب" tone="gold" value={<Kwd fils={Math.round(periodFils / periodOrders)} />} className="max-sm:col-span-2" />
          ) : null}
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Section title="أحدث الطلبات" icon={<Receipt />} tone="green" actions={<MoreLink href="/admin/orders">كل الطلبات</MoreLink>}>
          {latest.length === 0 ? (
            <EmptyState art="receipt" compact title="لا توجد طلبات بعد" description="ستظهر هنا الطلبات فور إنشائها من الطلاب." />
          ) : (
            <DataList>
              {latest.map((o) => (
                <DataRow
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  leading={
                    <ToneIcon tone={o.status === "paid" ? "green" : o.status === "refunded" ? "violet" : o.status === "pending" ? "gold" : "slate"} size="sm">
                      <Receipt />
                    </ToneIcon>
                  }
                  title={
                    <span className="num whitespace-nowrap" dir="ltr">
                      {o.number}
                    </span>
                  }
                  sub={
                    <>
                      {o.customer_name} · <span className="whitespace-nowrap">{formatDateTime(o.created_at)}</span>
                    </>
                  }
                  aside={
                    <div className="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:flex-col sm:items-end">
                      <Kwd fils={o.total_fils} className="font-display text-[1.05rem] font-black text-ink" />
                      <div className="flex flex-wrap justify-end gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.is_test ? <TestBadge /> : null}
                      </div>
                    </div>
                  }
                  className="max-sm:[&>div:last-child]:w-full"
                />
              ))}
            </DataList>
          )}
        </Section>

        <Section title="الأكثر مبيعًا" description="عدد المبيعات وقيمتها بسعر المنتج قبل الخصم" icon={<Trophy />} tone="gold">
          {top.length === 0 ? (
            <EmptyState art="generic" compact title="لا توجد مبيعات مدفوعة بعد." />
          ) : (
            <RankList
              items={top.map((p) => ({
                key: p.product_id,
                href: `/admin/products/${p.product_id}`,
                title: p.title,
                sub: PRODUCT_TYPE_LABELS[p.type as ProductType] ?? p.type,
                value: <Kwd fils={Number(p.revenue)} />,
                valueSub: count(p.sold, SALE),
              }))}
            />
          )}
        </Section>
      </div>

      <Section
        title="المبيعات حسب المعلم"
        description={`آخر ${count(days, W.day)}، قيمة عناصر الطلبات المدفوعة المنسوبة لكل معلم`}
        icon={<GraduationCap />}
        tone="pink"
        actions={<MoreLink href="/admin/teachers">كل المعلمين</MoreLink>}
      >
        {teachersTop.length === 0 ? (
          <EmptyState art="search" compact title="لا توجد مبيعات لمحتوى المعلمين في هذه الفترة." />
        ) : (
          <RankList
            grid
            items={teachersTop.map((t) => ({
              key: t.teacherId,
              href: `/admin/teachers/${t.teacherId}`,
              title: t.teacherName,
              sub: count(t.sold, SALE),
              value: <Kwd fils={t.revenueFils} />,
            }))}
          />
        )}
      </Section>
    </div>
  );
}

/** الصفحة الرئيسية للمعلم: أرقامه فقط — بدون بيانات الطلاب */
async function TeacherHome({ actor }: { actor: Extract<Actor, { kind: "teacher" }> }) {
  const d = await teacherDashboard(actor.teacherId);
  const today = todayLabel();
  const inReview = d.counts.in_review;
  return (
    <div className="space-y-6">
      <DashHero
        eyebrow={
          <>
            <Eyebrow tone="light" icon={<GraduationCap aria-hidden />}>
              لوحة المعلم
            </Eyebrow>
            {today ? <HeroChip icon={<CalendarDays aria-hidden />}>{today}</HeroChip> : null}
          </>
        }
        greeting="أهلًا"
        name={actor.teacherName}
        sub="ملخص محتواك ومبيعاته"
        chips={inReview ? <HeroChip icon={<Clock aria-hidden />}>{count(inReview, CONTENT)} بانتظار المراجعة</HeroChip> : null}
        actions={
          <>
            {actor.canUpload ? (
              <Button asChild variant="accent" size="lg">
                <Link href="/admin/products/new">
                  <Plus aria-hidden /> إضافة محتوى
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="light" size="md">
              <Link href="/admin/earnings">
                <Wallet aria-hidden /> عرض أرباحي
              </Link>
            </Button>
          </>
        }
      />

      {!actor.canUpload ? (
        <p className="flex items-center gap-3 rounded-[1.4rem] border-2 border-accent-200 bg-warning-50 p-4 font-display text-[0.95rem] font-bold text-warning shadow-[0_4px_0_color-mix(in_oklab,var(--accent-edge)_25%,white)]">
          <ToneIcon tone="gold" size="sm">
            <Clock />
          </ToneIcon>
          صلاحية رفع المحتوى موقوفة حاليًا، تواصل مع إدارة المنصة.
        </p>
      ) : null}

      {d.returned.length ? (
        <Section title="محتوى أُعيد إليك للتعديل" description="راجع ملاحظات الإدارة ثم أعد إرساله للمراجعة." icon={<BadgeCheck />} tone="coral">
          <DataList>
            {d.returned.map((r) => (
              <DataRow
                key={r.id}
                href={`/admin/products/${r.id}`}
                leading={
                  <ToneIcon tone="coral" size="sm">
                    <FileText />
                  </ToneIcon>
                }
                title={r.title}
                sub={r.review_note}
                badges={<StatusPill tone="review">بحاجة إلى تعديل</StatusPill>}
                className="border-coral/20 bg-coral-50/40"
              />
            ))}
          </DataList>
        </Section>
      ) : null}

      <StatGrid>
        <StatTile label="منشور" value={<span className="num">{ar(d.counts.published)}</span>} icon={<FileText />} href="/admin/products" />
        <StatTile label="بانتظار المراجعة" value={<span className="num">{ar(d.counts.in_review)}</span>} icon={<BadgeCheck />} />
        <StatTile label="مسودات" value={<span className="num">{ar(d.counts.draft)}</span>} icon={<GraduationCap />} />
        <StatTile label="عمليات بيع" value={<span className="num">{ar(d.summary.items)}</span>} hint={<Kwd fils={d.summary.grossFils} unitClassName="text-[var(--tink)]" />} icon={<Banknote />} href="/admin/earnings" />
      </StatGrid>

      {d.balance.earnedFils > 0 || d.balance.paidFils > 0 ? (
        <StatGrid cols={2}>
          <StatTile label="أرباحي المستحقة" value={<Kwd fils={d.balance.earnedFils} />} icon={<Wallet />} />
          <StatTile label="الرصيد غير المسدد" value={<Kwd fils={d.balance.balanceFils} />} icon={<Wallet />} />
        </StatGrid>
      ) : null}

      <QuickTiles
        items={[
          ...(actor.canUpload ? [{ href: "/admin/products/new", label: "محتوى جديد", sub: "وحدة فيديو أو مذكرة", icon: <Plus />, tone: "teal" as const }] : []),
          { href: "/admin/products", label: "محتواي", sub: count(d.counts.published + d.counts.in_review + d.counts.draft + d.counts.hidden, CONTENT), icon: <FileText />, tone: "sky" },
          { href: "/admin/earnings", label: "أرباحي ومبيعاتي", sub: "التفاصيل والتسويات", icon: <Wallet />, tone: "gold" },
          { href: "/admin/profile", label: "ملفي التعريفي", sub: "النبذة والصورة", icon: <UserRound />, tone: "pink" },
        ]}
      />

      <Section title="آخر مبيعات محتواك" icon={<Receipt />} tone="green" actions={<MoreLink href="/admin/earnings">التفاصيل</MoreLink>}>
        {d.latest.length === 0 ? (
          <EmptyState art="receipt" compact title="لا توجد مبيعات بعد" description="عند شراء الطلاب لمحتواك ستظهر العمليات هنا." />
        ) : (
          <DataList>
            {d.latest.map((s, i) => (
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
                    <span className="num whitespace-nowrap" dir="ltr">
                      {s.order_number}
                    </span>{" "}
                    · <span className="whitespace-nowrap">{formatDateTime(s.paid_at)}</span>
                  </>
                }
                aside={
                  <div className="flex items-center gap-2">
                    {s.status === "refunded" ? <StatusPill tone="violet">مسترد</StatusPill> : null}
                    <Kwd fils={s.unit_price_fils} className="font-display text-[1.05rem] font-black text-ink" />
                  </div>
                }
              />
            ))}
          </DataList>
        )}
      </Section>
    </div>
  );
}
