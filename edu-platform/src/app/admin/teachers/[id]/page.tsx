import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  BookOpenCheck,
  Camera,
  Clock3,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  KeyRound,
  Landmark,
  Mail,
  Percent,
  Plus,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  UserCog,
  UserMinus,
  UserRoundPen,
  Wallet,
} from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { getTeacherAdmin, subjectOptions, teacherSubjectIds } from "@/server/admin/teachers";
import { listAdminProducts } from "@/server/admin/products";
import { listEarnings, listPayouts, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { storage } from "@/server/storage";
import { getSettings } from "@/server/platform/settings";
import { latestAgreementAcceptance } from "@/server/admin/teacher-agreement";
import { Section, StatCard, StatGrid } from "@/components/admin/page-header";
import { TeacherForm } from "@/components/admin/teacher-form";
import { TeacherMoneyRules } from "@/components/admin/teacher-money-rules";
import { FileUploader } from "@/components/admin/file-uploader";
import { OneTimeSecretForm } from "@/components/admin/one-time-secret-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { DataList, DataRow } from "@/components/admin/data-list";
import { ProductStatusBadge, StatusPill } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { SubjectIcon } from "@/components/art";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { ar, count, subjectVars, W } from "@/lib/design";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { REFUND_HOLD_DAYS } from "@/lib/teacher-terms";
import {
  enableAccountAction,
  recordPayoutAction,
  removeTeacherPhotoAction,
  resetPasswordAction,
  setAccountActiveAction,
  setCanUploadAction,
  switchToManagedAction,
  updateTeacherAction,
  voidPayoutAction,
} from "../actions";
import { BandChip, ProfileHero } from "../../_components/people/band";
import { TeachersArt } from "../../_components/people/art";
import { Kwd, SoftNote, TypeIcon } from "../../_components/people/bits";
import { SALE_WORD, sharePct, subjectSlugOf } from "../../_components/people/helpers";

export const metadata = { title: "ملف المعلم" };

const METHOD_LABELS: Record<string, string> = { bank_transfer: "تحويل بنكي", cash: "نقدًا", other: "أخرى" };

function EarningStatus({ status, isHeld, heldUntil }: { status: string; isHeld: boolean; heldUntil: Date }) {
  if (status === "reversed") return <StatusPill tone="danger">معكوس (استرداد)</StatusPill>;
  if (isHeld) return <StatusPill tone="warning">قيد فترة الاسترداد حتى {formatDate(heldUntil)}</StatusPill>;
  return <StatusPill tone="success">مستحق</StatusPill>;
}

export default async function TeacherAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; test?: string }> }) {
  const owner = await requireOwnerPage();
  const { id } = await params;
  const sp = await searchParams;
  const teacher = await getTeacherAdmin(id);
  if (!teacher) notFound();
  const includeTest = sp.test === "1";
  const [subjects, chosen, products, summary, balance, earnings, payouts, settings, agreement] = await Promise.all([
    subjectOptions(),
    teacherSubjectIds(id),
    listAdminProducts(owner, { teacherId: id }),
    teacherSalesSummary(id, { includeTest }),
    teacherBalance(id, { includeTest }),
    listEarnings(id, { includeTest, limit: 200 }),
    listPayouts(id),
    getSettings(),
    teacher.user_id ? latestAgreementAcceptance(teacher.user_id) : Promise.resolve(null),
  ]);
  const photo = teacher.photo_key ? storage().publicUrl(teacher.photo_key) : null;
  const shareOn = teacher.revenue_share_bps !== null;
  // أسماء المواد المسندة (من خيارات المواد نفسها) لكبسولات الرأس
  const chosenSet = new Set(chosen);
  const mySubjects = subjects.filter((s) => chosenSet.has(s.id));
  const subjectNames = [...new Set(mySubjects.map((s) => s.name))];
  const gradeCount = new Set(mySubjects.map((s) => s.grade_name)).size;
  const lead = subjectSlugOf(subjectNames[0]);
  const selfManaged = teacher.mode === "self_managed" && teacher.user_id;

  return (
    <div className="space-y-6">
      <ProfileHero
        tone="pink"
        crumbs={[{ label: "المعلمون", href: "/admin/teachers" }, { label: teacher.display_name }]}
        avatar={<TeacherAvatar name={teacher.display_name} photoUrl={photo} size={104} subjectSlug={lead} ring="lg" decorative />}
        eyebrow={
          selfManaged
            ? { label: "حساب معلم", icon: <KeyRound aria-hidden />, tone: "teal" }
            : { label: "يديره المالك", icon: <UserCog aria-hidden />, tone: "gold" }
        }
        title={teacher.display_name}
        description={teacher.headline || "ملف المعلم"}
        chips={
          <>
            {teacher.is_published ? <StatusPill tone="success">صفحة ظاهرة</StatusPill> : <StatusPill tone="neutral">صفحة مخفية</StatusPill>}
            {!teacher.can_upload ? <StatusPill tone="warning">الرفع موقوف</StatusPill> : null}
            {subjectNames.slice(0, 4).map((n) => (
              <span key={n} className="chip min-h-8" style={subjectVars(subjectSlugOf(n))}>
                <SubjectIcon slug={subjectSlugOf(n) ?? undefined} name={n} />
                {n}
              </span>
            ))}
            {gradeCount ? <span className="chip chip-white min-h-8">{count(gradeCount, W.grade)}</span> : null}
            <BandChip tone="gold" icon={<Percent aria-hidden />}>
              {shareOn ? (
                <>
                  حصة المعلم {sharePct(teacher.revenue_share_bps!)}
                </>
              ) : (
                "الأرباح غير مفعّلة"
              )}
            </BandChip>
          </>
        }
        actions={
          <>
            <Button asChild size="md" variant="accent">
              <Link href={`/admin/products/new?teacher=${teacher.id}`}>
                <Plus aria-hidden /> إضافة محتوى لهذا المعلم
              </Link>
            </Button>
            {teacher.is_published ? (
              <Button asChild size="md" variant="outline">
                <Link href={`/teachers/${teacher.slug}`} target="_blank">
                  <ExternalLink aria-hidden /> الصفحة العامة
                </Link>
              </Button>
            ) : null}
          </>
        }
        art={<TeachersArt className="size-full" />}
      />
      {sp.created ? (
        <Alert tone="success" title="تم إضافة المعلم">
          يمكنك الآن رفع محتواه بنفسك (زر «إضافة محتوى لهذا المعلم»)، أو تفعيل حساب دخول له من قسم «الحساب والصلاحيات».
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title="الملف التعريفي" icon={<UserRoundPen />} tone="pink" description="ما يراه الطلاب في صفحة المعلم، والمواد والصلاحيات ونسبة الأرباح">
          <TeacherForm
            action={updateTeacherAction.bind(null, teacher.id)}
            subjects={subjects}
            submitLabel="حفظ التعديلات"
            defaults={{
              slug: teacher.slug,
              displayName: teacher.display_name,
              headline: teacher.headline,
              bio: teacher.bio,
              isPublished: teacher.is_published,
              canUpload: teacher.can_upload,
              revenueShare: shareOn ? String(teacher.revenue_share_bps! / 100) : "",
              sortOrder: String(teacher.sort_order),
              subjectIds: chosen,
            }}
          />
        </Section>

        <div className="space-y-6 max-lg:order-first">
          <div data-testid="teacher-account">
            <Section title="الحساب والصلاحيات" icon={<ShieldCheck />} tone="teal" description="تغيير طريقة الإدارة لا يحذف أي محتوى أو مبيعات.">
              {selfManaged ? (
                <div className="space-y-3 text-sm">
                  <div className="rounded-[1.3rem] bg-brand-50/70 p-3.5 ring-1 ring-brand-100 ring-inset">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">حساب معلم</Badge>
                      {teacher.account_active === false ? <StatusPill tone="danger">معطّل</StatusPill> : <StatusPill tone="success">نشط</StatusPill>}
                    </div>
                    <p dir="ltr" className="mt-2.5 flex items-center gap-2 text-start font-display font-extrabold break-all text-ink">
                      <Mail className="size-4 shrink-0 text-brand-600" aria-hidden />
                      {teacher.account_email}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Clock3 className="size-3.5" aria-hidden />
                      آخر دخول: {formatDateTime(teacher.account_last_login)}
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted" data-testid="teacher-agreement-status">
                      <ScrollText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>
                        {agreement ? (
                          <>
                            الاتفاقية: قبل النسخة <bdi dir="ltr">{agreement.version}</bdi> في {formatDateTime(agreement.acceptedAt)}
                            {agreement.isCurrent ? "" : "، ويُسأل عن الأحدث عند إرساله التالي"}
                          </>
                        ) : (
                          "الاتفاقية: لم يقبلها بعد، ويُسأل عند إرساله التالي"
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 [&_button]:w-full [&>div]:w-full">
                    <OneTimeSecretForm action={resetPasswordAction} className="space-y-2.5 rounded-[1.3rem] bg-canvas p-3">
                      <input type="hidden" name="teacherId" value={teacher.id} />
                      <Checkbox
                        name="confirmReset"
                        data-testid="confirm-teacher-reset"
                        className="items-start text-[0.85rem] leading-6"
                        label="أوافق على إعادة التعيين: تتوقف كلمته الحالية، ويُسجَّل خروجه من كل الأجهزة، وتظهر لي كلمة مؤقتة مرة واحدة."
                      />
                      <SubmitButton variant="outline" size="md" pendingText="جارٍ الإصدار…">
                        <KeyRound aria-hidden /> إعادة تعيين كلمة المرور
                      </SubmitButton>
                    </OneTimeSecretForm>
                    {teacher.account_active === false ? (
                      <ConfirmButton action={setAccountActiveAction} hidden={{ teacherId: teacher.id, active: "1" }} label="تفعيل الحساب" icon={<ShieldCheck aria-hidden />} variant="outline" title="تفعيل حساب المعلم؟" requireReason confirmLabel="تفعيل" />
                    ) : (
                      <ConfirmButton
                        action={setAccountActiveAction}
                        hidden={{ teacherId: teacher.id, active: "0" }}
                        label="تعطيل الحساب"
                        icon={<ShieldOff aria-hidden />}
                        title="تعطيل حساب المعلم؟"
                        description="لن يستطيع الدخول، ويبقى محتواه منشورًا ومبيعاته كما هي."
                        requireReason
                        confirmLabel="تعطيل"
                      />
                    )}
                    <ConfirmButton
                      action={switchToManagedAction}
                      hidden={{ teacherId: teacher.id }}
                      label="تحويل إلى «يديره المالك»"
                      icon={<UserMinus aria-hidden />}
                      variant="ghost"
                      title="إلغاء حساب الدخول للمعلم؟"
                      description="يتحول الحساب إلى طالب عادي ويُسجَّل خروجه. المحتوى والمبيعات والصلاحيات تبقى مرتبطة بملف المعلم وتديرها أنت."
                      confirmLabel="تحويل"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-[1.3rem] bg-accent-100/60 p-3.5 ring-1 ring-accent-200 ring-inset">
                    <Badge tone="neutral">يديره المالك، بدون حساب دخول</Badge>
                    <p className="mt-2 text-xs leading-6 text-ink-soft">لتفعيل حساب يرفع منه المعلم مسوداته بنفسه، أدخل بريده. ستظهر لك كلمة مؤقتة مرة واحدة، ويختار المعلم كلمته الخاصة عند أول دخول.</p>
                  </div>
                  <OneTimeSecretForm action={enableAccountAction} className="space-y-3">
                    <input type="hidden" name="teacherId" value={teacher.id} />
                    <Field label="بريد المعلم" htmlFor="acc-email">
                      <Input id="acc-email" name="email" type="email" dir="ltr" className="text-start" required />
                    </Field>
                    <Field label="الاسم الكامل" htmlFor="acc-name">
                      <Input id="acc-name" name="fullName" defaultValue={teacher.display_name} required />
                    </Field>
                    <Checkbox
                      name="confirmLinkExisting"
                      data-testid="confirm-link-existing"
                      className="items-start text-[0.85rem] leading-6"
                      label="إن كان هذا البريد لحساب طالب موجود، أوافق على ترقيته: تُستبدل كلمة مروره، ويُسجَّل خروجه، ويصله إشعار بالبريد."
                    />
                    <SubmitButton size="md" className="w-full">
                      <KeyRound aria-hidden /> تفعيل حساب المعلم
                    </SubmitButton>
                  </OneTimeSecretForm>
                </div>
              )}
              <div className="mt-4 border-t border-dashed border-line pt-3">
                {teacher.can_upload ? (
                  <QuickAction action={setCanUploadAction} hidden={{ teacherId: teacher.id, canUpload: "0" }} label="إيقاف صلاحية الرفع" variant="ghost" />
                ) : (
                  <>
                    <StatusPill tone="warning">صلاحية الرفع موقوفة</StatusPill>
                    <div className="mt-2">
                      <QuickAction action={setCanUploadAction} hidden={{ teacherId: teacher.id, canUpload: "1" }} label="إعادة تفعيل الرفع" variant="outline" />
                    </div>
                  </>
                )}
              </div>
            </Section>
          </div>

          <Section title="الصورة" icon={<Camera />} tone="violet">
            <div className="relative mb-4 grid place-items-center overflow-hidden rounded-[1.4rem] py-6" style={subjectVars(lead)}>
              <span className="absolute inset-0 bg-[var(--soft)]" aria-hidden />
              <span className="absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--b)_25%,transparent)_1.2px,transparent_1.6px)] bg-[length:16px_16px]" aria-hidden />
              <TeacherAvatar name={teacher.display_name} photoUrl={photo} size={128} subjectSlug={lead} ring="lg" className="relative" />
            </div>
            <FileUploader target="teacher_photo" teacherId={teacher.id} accept="image/jpeg,image/png,image/webp" label={photo ? "تغيير الصورة" : "رفع صورة"} hint="صورة مربعة، حتى 5 م.ب" compact />
            {photo ? (
              <div className="mt-2">
                <QuickAction action={removeTeacherPhotoAction} hidden={{ teacherId: teacher.id }} label="إزالة الصورة" variant="ghost" />
              </div>
            ) : null}
          </Section>
        </div>
      </div>

      <Section
        title="المبيعات والأرباح"
        icon={<Coins />}
        tone="gold"
        description={shareOn ? `حصة المعلم ${sharePct(teacher.revenue_share_bps!)} من صافي المبيعات المؤهلة (بعد الخصم والرسوم المعتمدة)` : "نظام الأرباح غير مفعّل لهذا المعلم، حدد نسبة في الملف لتفعيله للمبيعات القادمة."}
        actions={
          <Link
            href={includeTest ? `/admin/teachers/${id}` : `/admin/teachers/${id}?test=1`}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-display text-[0.85rem] font-extrabold ring-1 ring-inset transition-colors",
              includeTest ? "bg-sky-50 text-sky-700 ring-sky/25 hover:bg-sky-50/70" : "bg-surface text-ink-soft ring-line-strong hover:bg-mist",
            )}
          >
            {includeTest ? <EyeOff className="size-4" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
            {includeTest ? "إخفاء البيانات التجريبية" : "إظهار البيانات التجريبية"}
          </Link>
        }
      >
        <StatGrid cols={3}>
          <StatCard label="عمليات بيع" tone="green" value={<span>{ar(summary.items)}</span>} hint={count(summary.orders, W.order)} icon={<FileText />} />
          <StatCard label="إجمالي المبيعات" tone="sky" value={<Kwd fils={summary.grossFils} unitClassName="text-sm" />} icon={<Banknote />} />
          <StatCard
            label="إجمالي أرباح المعلم"
            tone="violet"
            value={<Kwd fils={balance.earnedFils} unitClassName="text-sm" />}
            hint={balance.reversedFils ? `معكوس بسبب استرداد: ${filsToKwdString(balance.reversedFils)}` : undefined}
            icon={<Wallet />}
          />
          <StatCard
            label="قيد فترة الاسترداد"
            tone="coral"
            value={<Kwd fils={balance.heldFils} unitClassName="text-sm" data-testid="teacher-held" />}
            hint={`لا تُدفع قبل مرور ${count(REFUND_HOLD_DAYS, W.day)} على البيع`}
            icon={<Clock3 />}
          />
          <StatCard
            label="المسدد"
            tone="teal"
            value={<Kwd fils={balance.paidFils} unitClassName="text-sm" data-testid="teacher-paid" />}
            icon={<Landmark />}
          />
          <StatCard
            label="الرصيد المستحق الآن"
            tone="gold"
            value={<Kwd fils={balance.balanceFils} className={balance.balanceFils < 0 ? "text-danger" : undefined} unitClassName="text-sm" data-testid="teacher-balance" />}
            hint="الأرباح بعد فترة الاسترداد ناقص المسدد"
            icon={<Wallet />}
          />
        </StatGrid>

        {balance.balanceFils < 0 ? (
          <Alert tone="warning" title="المسدد أكبر من الأرباح المتاحة الآن" className="mt-5">
            الفرق <span className="num">{filsToKwdString(-balance.balanceFils)}</span> د.ك. يحدث هذا عند استرداد طلب بعد تسويته، أو عند تسوية مبلغ ما زال قيد فترة الاسترداد. يُخصم الفرق من أرباح المعلم القادمة، ولا تتحرك أي أموال تلقائيًا.
          </Alert>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[1.4rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-3.5">
          <ToneIcon tone="gold" size="sm">
            <Landmark />
          </ToneIcon>
          <p className="min-w-[12rem] flex-1 text-[0.85rem] leading-6 text-ink-soft">
            سجّل ما دفعته للمعلم خارج المنصة. <span className="text-muted">كل تسوية تُحفظ في سجل التدقيق.</span>
          </p>
          <ConfirmButton
            action={recordPayoutAction}
            hidden={{ teacherId: teacher.id, requestId: randomUUID() }}
            label="تسجيل تسوية يدوية"
            icon={<Banknote aria-hidden />}
            variant="primary"
            size="md"
            title="تسجيل تسوية للمعلم"
            description={`سجّل مبلغًا دفعته للمعلم خارج المنصة (تحويل بنكي أو نقدًا). لا تتم أي تحويلات تلقائية. الرصيد المستحق الآن ${filsToKwdString(Math.max(balance.balanceFils, 0))} د.ك، ولا يشمل ${filsToKwdString(balance.heldFils)} د.ك قيد فترة الاسترداد. لا تكتب الآيبان أو بيانات الحساب هنا، فالمنصة لا تحفظها.`}
            selectField={{ name: "method", label: "طريقة الدفع", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) }}
            fields={[
              { name: "amount", label: "المبلغ (د.ك)", placeholder: filsToKwdString(Math.max(balance.balanceFils, 0)), ltr: true, testId: "payout-amount" },
              { name: "reference", label: "المرجع (رقم عملية التحويل)", ltr: true, testId: "payout-reference" },
            ]}
            checkbox={{ name: "confirmOverBalance", label: "إن كان المبلغ أكبر من الرصيد المستحق الآن، أؤكد تسجيله دفعة زائدة، ويصبح رصيد المعلم سالبًا بالفرق.", testId: "payout-over-balance" }}
            requireReason
            reasonLabel="ملاحظة (إلزامي)"
            confirmLabel="تسجيل التسوية"
          />
        </div>

        <h3 className="mt-7 mb-3 flex items-center gap-2 font-display text-[1.1rem] font-black text-ink">
          <FileText className="size-4 text-brand-600" aria-hidden /> السجل المحاسبي
        </h3>
        {earnings.length === 0 ? (
          <SoftNote icon={<Coins aria-hidden />}>لا توجد أرباح مسجلة بعد.</SoftNote>
        ) : (
          <>
          {/* الجدول الكامل للشاشات الواسعة (عشرة أعمدة لا تتسع لأقل من ذلك) */}
          <div className="hidden min-[1320px]:block">
          <Table>
            <THead>
              <tr>
                <TH>الطلب</TH>
                <TH>المنتج</TH>
                <TH>القيمة</TH>
                <TH>الخصم</TH>
                <TH>الرسوم</TH>
                <TH>الصافي</TH>
                <TH>النسبة</TH>
                <TH>حصة المعلم</TH>
                <TH>حصة المنصة</TH>
                <TH>الحالة</TH>
              </tr>
            </THead>
            <tbody>
              {earnings.map((e) => (
                <TR key={e.id}>
                  <TD>
                    <Link href={`/admin/orders/${e.order_id}`} className="num font-display font-extrabold whitespace-nowrap text-brand-700 hover:underline">
                      {e.order_number}
                    </Link>
                    <p className="text-xs text-muted">{formatDate(e.created_at)}</p>
                  </TD>
                  <TD className="max-w-48 text-xs font-semibold text-ink">
                    {e.product_title}
                    {e.bundle_title ? <span className="block font-normal text-muted">ضمن «{e.bundle_title}»</span> : null}
                  </TD>
                  <TD className="num">{filsToKwdString(e.gross_fils)}</TD>
                  <TD className="num text-muted">{filsToKwdString(e.discount_fils)}</TD>
                  <TD className="num text-muted">{filsToKwdString(e.fee_fils)}</TD>
                  <TD className="num">{filsToKwdString(e.net_fils)}</TD>
                  <TD className="text-xs font-bold whitespace-nowrap">{sharePct(e.share_bps)}</TD>
                  <TD className="num font-display font-black text-brand-800">{filsToKwdString(e.teacher_fils)}</TD>
                  <TD className="num">{filsToKwdString(e.platform_fils)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <EarningStatus status={e.status} isHeld={e.is_held} heldUntil={e.held_until} />
                      {e.is_test ? <StatusPill tone="info">تجريبي</StatusPill> : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          </div>
          {/* بطاقات للجوال والأجهزة اللوحية: حصة المعلم والحالة ظاهرتان أولًا، والتفاصيل في شبكة صغيرة */}
          <DataList className="min-[1320px]:hidden">
            {earnings.map((e) => (
              <DataRow
                key={e.id}
                href={`/admin/orders/${e.order_id}`}
                leading={
                  <ToneIcon tone={e.status === "reversed" ? "coral" : "gold"} size="sm">
                    <Coins />
                  </ToneIcon>
                }
                title={
                  <>
                    <span className="num whitespace-nowrap">{e.order_number}</span>{" "}
                    <span className="font-sans text-[0.78rem] font-semibold whitespace-nowrap text-muted">{formatDate(e.created_at)}</span>
                  </>
                }
                sub={
                  <span className="line-clamp-2">
                    {e.product_title}
                    {e.bundle_title ? ` (ضمن «${e.bundle_title}»)` : ""}
                  </span>
                }
                aside={
                  <>
                    <span className="flex flex-wrap gap-1">
                      <EarningStatus status={e.status} isHeld={e.is_held} heldUntil={e.held_until} />
                      {e.is_test ? <StatusPill tone="info">تجريبي</StatusPill> : null}
                    </span>
                    <span className="text-end">
                      <span className="block text-[0.7rem] font-bold text-muted">حصة المعلم</span>
                      <Kwd fils={e.teacher_fils} className="font-display text-[1.05rem] font-black text-brand-800" />
                    </span>
                  </>
                }
                footer={
                  <dl className="grid grid-cols-2 gap-1.5 text-[0.78rem] sm:grid-cols-3">
                    {[
                      { label: "القيمة", fils: e.gross_fils },
                      { label: "الخصم", fils: e.discount_fils },
                      { label: "الرسوم", fils: e.fee_fils },
                      { label: "الصافي", fils: e.net_fils },
                      { label: "حصة المنصة", fils: e.platform_fils },
                    ].map((it) => (
                      <div key={it.label} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-1.5">
                        <dt className="font-bold text-muted">{it.label}</dt>
                        <dd className="num font-display font-extrabold text-ink">{filsToKwdString(it.fils)}</dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-accent-100/70 px-3 py-1.5">
                      <dt className="font-bold text-accent-900">النسبة</dt>
                      <dd className="font-display font-extrabold text-ink">{sharePct(e.share_bps)}</dd>
                    </div>
                  </dl>
                }
              />
            ))}
          </DataList>
          </>
        )}

        <h3 className="mt-7 mb-3 flex items-center gap-2 font-display text-[1.1rem] font-black text-ink">
          <Landmark className="size-4 text-brand-600" aria-hidden /> التسويات المسددة
        </h3>
        {payouts.length === 0 ? (
          <SoftNote icon={<Landmark aria-hidden />}>لا توجد تسويات بعد.</SoftNote>
        ) : (
          <DataList>
            {payouts.map((p) => (
              <DataRow
                key={p.id}
                leading={
                  <ToneIcon tone={p.voided_at ? "coral" : "gold"} size="sm">
                    <Banknote />
                  </ToneIcon>
                }
                title={<Kwd fils={p.amount_fils} className={p.voided_at ? "text-muted line-through" : undefined} />}
                sub={
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                    {p.reference ? (
                      <span className="num text-xs" dir="ltr">
                        {p.reference}
                      </span>
                    ) : null}
                    {p.note ? <span className="text-xs">{p.note}</span> : null}
                    {p.voided_at ? (
                      <span className="basis-full text-xs">
                        سبب الإلغاء: {p.void_reason}
                        {p.voided_by_name ? ` (${p.voided_by_name}، ${formatDateTime(p.voided_at)})` : ""}
                      </span>
                    ) : null}
                  </span>
                }
                aside={
                  <span className="flex flex-col items-end gap-1.5 text-end text-xs text-muted">
                    <span>
                      {formatDateTime(p.paid_at)}
                      {p.created_by_name ? <span className="block">{p.created_by_name}</span> : null}
                    </span>
                    {p.voided_at ? (
                      <StatusPill tone="danger">ملغاة</StatusPill>
                    ) : (
                      <ConfirmButton
                        action={voidPayoutAction}
                        hidden={{ payoutId: p.id }}
                        label="إلغاء التسوية"
                        variant="danger-outline"
                        title="إلغاء هذه التسوية؟"
                        description={`استخدمها عند تسجيل تسوية بالخطأ. يبقى السطر في السجل ظاهرًا كملغى، ويعود ${filsToKwdString(p.amount_fils)} د.ك إلى رصيد المعلم مرة واحدة. هذا لا يعيد أي مبلغ حُوّل فعلًا.`}
                        requireReason
                        reasonLabel="سبب الإلغاء (إلزامي)"
                        confirmLabel="إلغاء التسوية"
                      />
                    )}
                  </span>
                }
              />
            ))}
          </DataList>
        )}
      </Section>

      <TeacherMoneyRules audience="owner" shareBps={teacher.revenue_share_bps} feePercentBps={settings.fee_percent_bps} feeFixedFils={settings.fee_fixed_fils} />

      <Section title={`محتوى المعلم (${ar(products.length)})`} icon={<BookOpenCheck />} tone="sky">
        {products.length === 0 ? (
          <SoftNote icon={<BookOpenCheck aria-hidden />}>لا يوجد محتوى بعد.</SoftNote>
        ) : (
          <DataList>
            {products.map((p) => (
              <DataRow
                key={p.id}
                href={`/admin/products/${p.id}`}
                leading={<TypeIcon type={p.type} />}
                title={p.title}
                sub={
                  <>
                    {[PRODUCT_TYPE_LABELS[p.type], p.grade_name, p.subject_name].filter(Boolean).join("، ")}
                  </>
                }
                aside={
                  <>
                    <span className="chip chip-white">
                      {count(p.sold, SALE_WORD)}
                    </span>
                    <ProductStatusBadge status={p.status} />
                  </>
                }
              />
            ))}
          </DataList>
        )}
      </Section>
    </div>
  );
}
