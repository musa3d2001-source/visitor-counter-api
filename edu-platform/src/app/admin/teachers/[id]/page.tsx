import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, ExternalLink, FileText, GraduationCap, KeyRound, Plus, ShieldOff, ShieldCheck, UserMinus, Wallet } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { getTeacherAdmin, subjectOptions, teacherSubjectIds } from "@/server/admin/teachers";
import { listAdminProducts } from "@/server/admin/products";
import { listEarnings, listPayouts, teacherBalance, teacherSalesSummary } from "@/server/commerce/earnings";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section, StatCard } from "@/components/admin/page-header";
import { TeacherForm } from "@/components/admin/teacher-form";
import { FileUploader } from "@/components/admin/file-uploader";
import { OneTimeSecretForm } from "@/components/admin/one-time-secret-form";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  enableAccountAction,
  recordPayoutAction,
  removeTeacherPhotoAction,
  resetPasswordAction,
  setAccountActiveAction,
  setCanUploadAction,
  switchToManagedAction,
  updateTeacherAction,
} from "../actions";

export const metadata = { title: "ملف المعلم" };

const METHOD_LABELS: Record<string, string> = { bank_transfer: "تحويل بنكي", cash: "نقدًا", other: "أخرى" };

export default async function TeacherAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; test?: string }> }) {
  const owner = await requireOwnerPage();
  const { id } = await params;
  const sp = await searchParams;
  const teacher = await getTeacherAdmin(id);
  if (!teacher) notFound();
  const includeTest = sp.test === "1";
  const [subjects, chosen, products, summary, balance, earnings, payouts] = await Promise.all([
    subjectOptions(),
    teacherSubjectIds(id),
    listAdminProducts(owner, { teacherId: id }),
    teacherSalesSummary(id, { includeTest }),
    teacherBalance(id, { includeTest }),
    listEarnings(id, { includeTest, limit: 200 }),
    listPayouts(id),
  ]);
  const photo = teacher.photo_key ? storage().publicUrl(teacher.photo_key) : null;
  const shareOn = teacher.revenue_share_bps !== null;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={teacher.display_name}
        description={teacher.headline || "ملف المعلم"}
        crumbs={[{ label: "المعلمون", href: "/admin/teachers" }, { label: teacher.display_name }]}
        actions={
          <>
            <Button asChild size="sm">
              <Link href={`/admin/products/new?teacher=${teacher.id}`}>
                <Plus aria-hidden /> إضافة محتوى لهذا المعلم
              </Link>
            </Button>
            {teacher.is_published ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/teachers/${teacher.slug}`} target="_blank">
                  <ExternalLink aria-hidden /> الصفحة العامة
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {sp.created ? (
        <Alert tone="success" title="تم إضافة المعلم">
          يمكنك الآن رفع محتواه بنفسك (زر «إضافة محتوى لهذا المعلم»)، أو تفعيل حساب دخول له من قسم «الحساب والصلاحيات».
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Section title="الملف التعريفي">
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

        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 font-bold">الصورة</h2>
            <div className="relative mx-auto mb-3 grid size-36 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-700">
              {photo ? <Image src={photo} alt={teacher.display_name} fill sizes="144px" className="object-cover" /> : <GraduationCap className="size-12" aria-hidden />}
            </div>
            <FileUploader target="teacher_photo" teacherId={teacher.id} accept="image/jpeg,image/png,image/webp" label={photo ? "تغيير الصورة" : "رفع صورة"} hint="صورة مربعة · حتى 5 م.ب" compact />
            {photo ? (
              <div className="mt-2">
                <QuickAction action={removeTeacherPhotoAction} hidden={{ teacherId: teacher.id }} label="إزالة الصورة" variant="ghost" />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card" data-testid="teacher-account">
            <h2 className="mb-1 font-bold">الحساب والصلاحيات</h2>
            <p className="mb-4 text-xs text-muted">تغيير طريقة الإدارة لا يحذف أي محتوى أو مبيعات.</p>
            {teacher.mode === "self_managed" && teacher.user_id ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">حساب معلم</Badge>
                  {teacher.account_active === false ? <Badge tone="danger">معطّل</Badge> : <Badge tone="success">نشط</Badge>}
                </div>
                <p dir="ltr" className="text-start font-semibold">
                  {teacher.account_email}
                </p>
                <p className="text-xs text-muted">آخر دخول: {formatDateTime(teacher.account_last_login)}</p>
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <ConfirmButton
                    action={resetPasswordAction}
                    hidden={{ teacherId: teacher.id }}
                    label="إعادة تعيين كلمة المرور"
                    icon={<KeyRound aria-hidden />}
                    variant="outline"
                    title="إعادة تعيين كلمة المرور؟"
                    description="ستُولَّد كلمة مرور جديدة وتُعرض مرة واحدة، ويُسجَّل خروج المعلم من كل الأجهزة."
                    confirmLabel="إعادة التعيين"
                  />
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
                <Badge tone="neutral">يديره المالك — بدون حساب دخول</Badge>
                <p className="text-xs leading-6 text-muted">لتفعيل حساب يرفع منه المعلم مسوداته بنفسه، أدخل بريده. إن كان البريد مسجلًا كطالب سيُرقّى حسابه.</p>
                <OneTimeSecretForm action={enableAccountAction} className="space-y-3">
                  <input type="hidden" name="teacherId" value={teacher.id} />
                  <Field label="بريد المعلم" htmlFor="acc-email">
                    <Input id="acc-email" name="email" type="email" dir="ltr" className="text-start" required />
                  </Field>
                  <Field label="الاسم الكامل" htmlFor="acc-name">
                    <Input id="acc-name" name="fullName" defaultValue={teacher.display_name} required />
                  </Field>
                  <SubmitButton size="sm">تفعيل حساب المعلم</SubmitButton>
                </OneTimeSecretForm>
              </div>
            )}
            <div className="mt-4 border-t border-line pt-3">
              {teacher.can_upload ? (
                <QuickAction action={setCanUploadAction} hidden={{ teacherId: teacher.id, canUpload: "0" }} label="إيقاف صلاحية الرفع" variant="ghost" />
              ) : (
                <>
                  <Badge tone="warning">صلاحية الرفع موقوفة</Badge>
                  <div className="mt-2">
                    <QuickAction action={setCanUploadAction} hidden={{ teacherId: teacher.id, canUpload: "1" }} label="إعادة تفعيل الرفع" variant="outline" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Section
        title="المبيعات والأرباح"
        description={shareOn ? `حصة المعلم ${teacher.revenue_share_bps! / 100}% من صافي المبيعات المؤهلة (بعد الخصم والرسوم المعتمدة)` : "نظام الأرباح غير مفعّل لهذا المعلم — حدد نسبة في الملف لتفعيله للمبيعات القادمة."}
        actions={
          <Link href={includeTest ? `/admin/teachers/${id}` : `/admin/teachers/${id}?test=1`} className="rounded-xl border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-brand-50">
            {includeTest ? "إخفاء البيانات التجريبية" : "إظهار البيانات التجريبية"}
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="عمليات بيع" value={<span className="num">{summary.items}</span>} hint={`${summary.orders} طلب`} icon={<FileText />} />
          <StatCard label="إجمالي المبيعات" value={<><span className="num">{filsToKwdString(summary.grossFils)}</span> <span className="text-sm text-muted">د.ك</span></>} icon={<Banknote />} />
          <StatCard label="المستحق للمعلم" value={<><span className="num">{filsToKwdString(balance.earnedFils)}</span> <span className="text-sm text-muted">د.ك</span></>} hint={balance.reversedFils ? `معكوس بسبب استرداد: ${filsToKwdString(balance.reversedFils)}` : undefined} icon={<Wallet />} />
          <StatCard
            label="الرصيد غير المسدد"
            value={<><span className={`num ${balance.balanceFils < 0 ? "text-danger" : ""}`} data-testid="teacher-balance">{filsToKwdString(balance.balanceFils)}</span> <span className="text-sm text-muted">د.ك</span></>}
            hint={`المسدد: ${filsToKwdString(balance.paidFils)} د.ك`}
            icon={<Wallet />}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ConfirmButton
            action={recordPayoutAction}
            hidden={{ teacherId: teacher.id }}
            label="تسجيل تسوية يدوية"
            icon={<Banknote aria-hidden />}
            variant="primary"
            title="تسجيل تسوية للمعلم"
            description="سجّل مبلغًا دفعته للمعلم خارج المنصة (تحويل بنكي أو نقدًا). لا تتم أي تحويلات تلقائية."
            selectField={{ name: "method", label: "طريقة الدفع", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) }}
            fields={[
              { name: "amount", label: "المبلغ (د.ك)", placeholder: filsToKwdString(Math.max(balance.balanceFils, 0)), ltr: true },
              { name: "reference", label: "المرجع (رقم التحويل)", ltr: true },
            ]}
            requireReason
            reasonLabel="ملاحظة (إلزامي)"
            confirmLabel="تسجيل التسوية"
          />
          <p className="text-xs text-muted">كل تسوية تُحفظ في سجل التدقيق.</p>
        </div>

        <h3 className="mt-6 mb-2 font-bold">السجل المحاسبي</h3>
        {earnings.length === 0 ? (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد أرباح مسجلة بعد.</p>
        ) : (
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
                    <Link href={`/admin/orders/${e.order_id}`} className="num font-semibold text-brand-700 hover:underline">
                      {e.order_number}
                    </Link>
                    <p className="text-xs text-muted">{formatDate(e.created_at)}</p>
                  </TD>
                  <TD className="max-w-48 text-xs">{e.product_title}</TD>
                  <TD className="num">{filsToKwdString(e.gross_fils)}</TD>
                  <TD className="num text-muted">{filsToKwdString(e.discount_fils)}</TD>
                  <TD className="num text-muted">{filsToKwdString(e.fee_fils)}</TD>
                  <TD className="num">{filsToKwdString(e.net_fils)}</TD>
                  <TD className="num text-xs">{e.share_bps / 100}%</TD>
                  <TD className="num font-semibold">{filsToKwdString(e.teacher_fils)}</TD>
                  <TD className="num">{filsToKwdString(e.platform_fils)}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {e.status === "reversed" ? <Badge tone="danger">معكوس (استرداد)</Badge> : <Badge tone="success">مستحق</Badge>}
                      {e.is_test ? <Badge tone="warning">تجريبي</Badge> : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        <h3 className="mt-6 mb-2 font-bold">التسويات المسددة</h3>
        {payouts.length === 0 ? (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد تسويات بعد.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <span className="num font-bold">{filsToKwdString(p.amount_fils)} د.ك</span>
                <span className="text-muted">{METHOD_LABELS[p.method] ?? p.method}</span>
                {p.reference ? (
                  <span className="num text-xs text-muted" dir="ltr">
                    {p.reference}
                  </span>
                ) : null}
                <span className="text-xs text-muted">{p.note}</span>
                <span className="ms-auto text-xs text-muted">
                  {formatDateTime(p.paid_at)} {p.created_by_name ? `— ${p.created_by_name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`محتوى المعلم (${products.length})`}>
        {products.length === 0 ? (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا يوجد محتوى بعد.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${p.id}`} className="font-semibold hover:text-brand-700">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {PRODUCT_TYPE_LABELS[p.type]} · {p.grade_name} · {p.subject_name ?? "—"}
                  </p>
                </div>
                <span className="num text-xs text-muted">{p.sold} مبيعات</span>
                <ProductStatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
