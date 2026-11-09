import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { notFound } from "next/navigation";
import type * as React from "react";
import {
  Ban,
  BookOpen,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Clock3,
  Download,
  Eraser,
  Eye,
  FileClock,
  FileSignature,
  KeyRound,
  Library,
  Mail,
  Phone,
  PlayCircle,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { getStudent, grantableProducts } from "@/server/admin/records";
import { anonymizationBlockers } from "@/server/admin/student-anonymize";
import { Section, StatGrid, StatTile } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { DataList, DataRow, EmptyValue } from "@/components/admin/data-list";
import { OrderStatusBadge, StatusPill, TestBadge } from "@/components/admin/status-badge";
import { ToneIcon } from "@/components/admin/icon-tile";
import type { AdminTone } from "@/components/admin/tones";
import { Field, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { displayPhone } from "@/lib/phone";
import { ENTITLEMENT_SOURCE_LABELS, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { CONSENT_KIND_LABELS } from "@/lib/consent";
import { ar, gradeVars } from "@/lib/design";
import { formatDate, formatDateTime } from "@/lib/utils";
import { grantAction, revokeAction, setActiveAction } from "../actions";
import { StudentEmailCorrection, StudentEmailMarkVerified, StudentPasswordReset } from "../_components/recovery";
import { StudentAnonymize } from "../_components/anonymize";
import { BandChip, ProfileHero } from "../../_components/people/band";
import { StudentsArt } from "../../_components/people/art";
import { Kwd, PersonAvatar, SoftNote, Timeline, TimelineItem, TypeIcon } from "../../_components/people/bits";
import { formatTime, gradeLevelFromName, orderTone } from "../../_components/people/helpers";

export const metadata = { title: "ملف الطالب" };

const ACCESS_LABELS: Record<string, string> = { view: "قراءة", download: "تنزيل", preview: "معاينة", video: "مشاهدة فيديو", denied: "محاولة مرفوضة" };
const ACCESS_STYLE: Record<string, { tone: AdminTone; icon: React.ReactNode }> = {
  view: { tone: "sky", icon: <BookOpen /> },
  download: { tone: "teal", icon: <Download /> },
  preview: { tone: "gold", icon: <Eye /> },
  video: { tone: "violet", icon: <PlayCircle /> },
  denied: { tone: "coral", icon: <ShieldAlert /> },
};

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, products] = await Promise.all([getStudent(id), grantableProducts()]);
  if (!data) notFound();
  const { user, orders, entitlements, access, auditTrail, consents } = data;
  const anonymized = Boolean(user.anonymized_at);
  const blockers = user.role === "student" && !anonymized ? await anonymizationBlockers(user.id) : [];
  const active = entitlements.filter((e) => !e.revoked_at);
  const revoked = entitlements.filter((e) => e.revoked_at);
  const level = gradeLevelFromName(user.grade_name);

  return (
    <div className="space-y-6">
      <ProfileHero
        tone="violet"
        crumbs={[{ label: "الطلاب", href: "/admin/students" }, { label: user.full_name }]}
        avatar={<PersonAvatar name={user.full_name} size={96} ring="lg" className="max-sm:size-20" />}
        eyebrow={{ label: user.role === "admin" ? "حساب مدير" : "حساب طالب", icon: <Library aria-hidden />, tone: "violet" }}
        title={user.full_name}
        chips={
          <>
            {anonymized ? <StatusPill tone="neutral">حُذفت بياناته</StatusPill> : user.is_active ? <StatusPill tone="success">نشط</StatusPill> : <StatusPill tone="danger">موقوف</StatusPill>}
            {user.grade_name ? (
              <span className="chip min-h-8" style={gradeVars(level)}>
                {user.grade_name}
              </span>
            ) : null}
            <BandChip tone="violet" icon={<Mail aria-hidden />}>
              <bdi dir="ltr">{user.email}</bdi>
            </BandChip>
            {user.phone ? (
              <BandChip tone="green" icon={<Phone aria-hidden />}>
                <span className="num">{displayPhone(user.phone)}</span>
              </BandChip>
            ) : null}
          </>
        }
        actions={
          anonymized ? null : user.is_active ? (
            <ConfirmButton
              action={setActiveAction}
              hidden={{ userId: user.id, active: "0" }}
              label="إيقاف الحساب"
              icon={<Ban aria-hidden />}
              title="إيقاف حساب الطالب؟"
              description="لن يتمكن الطالب من تسجيل الدخول أو فتح مكتبته، وسيتم تسجيل خروجه من كل الأجهزة."
              requireReason
              confirmLabel="إيقاف"
            />
          ) : (
            <ConfirmButton
              action={setActiveAction}
              hidden={{ userId: user.id, active: "1" }}
              label="تفعيل الحساب"
              icon={<CircleCheck aria-hidden />}
              variant="primary"
              title="إعادة تفعيل الحساب؟"
              confirmLabel="تفعيل"
            />
          )
        }
        art={<StudentsArt className="size-full" />}
      />

      <StatGrid cols={4}>
        <StatTile label="صلاحيات نشطة" tone="violet" icon={<Library />} value={<span>{ar(active.length)}</span>} />
        <StatTile label="عدد الطلبات" tone="green" icon={<Receipt />} value={<span>{ar(orders.length)}</span>} />
        <StatTile label="تاريخ التسجيل" tone="sky" icon={<CalendarDays />} value={<span className="text-[1.15rem] sm:text-[1.3rem]">{formatDate(user.created_at)}</span>} hint={formatTime(user.created_at)} />
        <StatTile
          label="آخر دخول"
          tone="gold"
          icon={<Clock3 />}
          value={<span className="text-[1.15rem] sm:text-[1.3rem]">{user.last_login_at ? formatDate(user.last_login_at) : "لم يدخل بعد"}</span>}
          hint={user.last_login_at ? formatTime(user.last_login_at) : undefined}
        />
      </StatGrid>

      {anonymized ? (
        <SoftNote icon={<Eraser aria-hidden />} data-testid="student-anonymized-note">
          حُذفت بيانات هذا الطالب الشخصية في {formatDateTime(user.anonymized_at)}. تبقى طلباته وموافقاته بلا هوية، ولا يمكن فتح الحساب أو تعديله.
        </SoftNote>
      ) : null}

      {user.role === "student" && !anonymized ? (
        <Section title="استعادة الحساب" icon={<KeyRound />} tone="gold" description="للطالب الذي فقد الوصول إلى حسابه. كل إجراء يتطلب سببًا ويُسجَّل في سجل التدقيق.">
          <div className="mb-4 flex flex-wrap gap-2" data-testid="student-account-state">
            {user.email_verified_at ? <StatusPill tone="success">البريد مؤكد</StatusPill> : <StatusPill tone="warning">البريد غير مؤكد</StatusPill>}
            {user.must_change_password ? <StatusPill tone="warning">بانتظار اختيار كلمة مرور جديدة</StatusPill> : null}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StudentPasswordReset userId={user.id} />
            <StudentEmailCorrection userId={user.id} currentEmail={user.email} />
            {user.email_verified_at ? null : <StudentEmailMarkVerified userId={user.id} currentEmail={user.email} />}
          </div>
        </Section>
      ) : null}

      <Section
        title="الصلاحيات (المكتبة)"
        icon={<Library />}
        tone="violet"
        description="المنتجات التي يستطيع الطالب الوصول إليها. المنح والسحب اليدوي يتطلبان سببًا ويُسجلان في سجل التدقيق."
      >
        {active.length === 0 ? (
          <SoftNote icon={<Library aria-hidden />} className="mb-5">
            لا توجد صلاحيات نشطة.
          </SoftNote>
        ) : (
          <ul className="mb-5 grid gap-3 md:grid-cols-2">
            {active.map((e) => (
              <li key={e.id} className="relative flex min-w-0 flex-col gap-2 rounded-[1.4rem] border border-line bg-surface p-3.5 shadow-xs">
                <div className="flex min-w-0 flex-wrap items-start gap-3 sm:flex-nowrap">
                  <TypeIcon type={e.type} size="md" />
                  <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
                    <Link href={`/admin/products/${e.product_id}`} className="line-clamp-2 font-display font-extrabold text-ink hover:text-brand-700">
                      {e.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className="chip chip-mint">{PRODUCT_TYPE_LABELS[e.type as ProductType] ?? e.type}</span>
                      <span className="chip" style={{ "--soft": "var(--color-violet-50)", "--tink": "var(--color-violet-700)" } as React.CSSProperties}>
                        {ENTITLEMENT_SOURCE_LABELS[e.source] ?? e.source}
                      </span>
                      {e.order_number ? (
                        <span className="chip chip-white">
                          طلب <bdi className="num">{e.order_number}</bdi>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 max-sm:ms-auto">
                    <ConfirmButton
                      action={revokeAction}
                      hidden={{ userId: user.id, productId: e.product_id }}
                      label="سحب"
                      icon={<Undo2 aria-hidden />}
                      title={`سحب صلاحية «${e.title}»؟`}
                      description={e.type === "bundle" ? "سيتم سحب الباقة وكل المنتجات الممنوحة عبرها." : "لن يتمكن الطالب من فتح هذا المنتج بعد الآن."}
                      requireReason
                      confirmLabel="سحب الصلاحية"
                    />
                  </div>
                </div>
                <p className="border-t border-dashed border-line pt-2 text-[0.8rem] leading-6 text-muted">
                  {e.via_bundle_title ? <>عبر «{e.via_bundle_title}»، </> : null}
                  {e.grant_reason ? <>السبب: {e.grant_reason}، </> : null}
                  <bdi>{formatDateTime(e.granted_at)}</bdi>
                </p>
              </li>
            ))}
          </ul>
        )}

        {anonymized ? null : (
          <div className="relative overflow-hidden rounded-[1.5rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-4 sm:p-5">
            <h3 className="mb-4 flex items-center gap-2.5 font-display text-[1.1rem] font-black text-ink">
              <ToneIcon tone="gold" size="sm">
                <KeyRound />
              </ToneIcon>
              منح صلاحية يدويًا
            </h3>
            <ActionForm action={grantAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="userId" value={user.id} />
              <Field label="المنتج" htmlFor="grant-product" required>
                <Select id="grant-product" name="productId" defaultValue="">
                  <option value="">اختر المنتج</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.grade_name}، {p.title}
                      {p.type === "bundle" ? " (باقة)" : ""}
                      {p.status !== "published" ? " [غير منشور]" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="السبب (إلزامي)" htmlFor="grant-reason" required hint="مثال: دفع نقدي، تعويض عن مشكلة تقنية">
                <Textarea id="grant-reason" name="reason" rows={2} minLength={3} maxLength={500} />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton size="md" variant="accent">
                  منح الصلاحية
                </SubmitButton>
              </div>
            </ActionForm>
          </div>
        )}

        {revoked.length ? (
          <details className="group mt-5 rounded-[1.3rem] bg-canvas/70 ring-1 ring-line ring-inset">
            <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-display text-sm font-bold text-ink-soft">
              <Undo2 className="size-4 text-coral" aria-hidden />
              صلاحيات مسحوبة ({ar(revoked.length)})
            </summary>
            <ul className="space-y-1.5 px-3 pb-3 text-sm">
              {revoked.map((e) => (
                <li key={e.id} className="rounded-xl bg-surface px-3 py-2 leading-7">
                  <span className="font-semibold">{e.title}</span>، سُحبت {formatDateTime(e.revoked_at)}
                  {e.revoke_reason ? <>، السبب: {e.revoke_reason}</> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section title="الطلبات" icon={<Receipt />} tone="green">
        {orders.length === 0 ? (
          <SoftNote icon={<Receipt aria-hidden />}>لا توجد طلبات.</SoftNote>
        ) : (
          <DataList>
            {orders.map((o) => (
              <DataRow
                key={o.id}
                href={`/admin/orders/${o.id}`}
                leading={
                  <ToneIcon tone={orderTone(o.status)} size="sm">
                    <Receipt />
                  </ToneIcon>
                }
                title={<span className="num whitespace-nowrap">{o.number}</span>}
                sub={formatDateTime(o.created_at)}
                aside={
                  <>
                    <span className="flex flex-wrap gap-1">
                      <OrderStatusBadge status={o.status} />
                      {o.is_test ? <TestBadge /> : null}
                    </span>
                    <Kwd fils={o.total_fils} className="font-display text-[1.05rem] font-black text-ink" />
                  </>
                }
              />
            ))}
          </DataList>
        )}
      </Section>

      <Section title="سجل الموافقات" description={`آخر ${ar(50)} موافقة. هذا ما أقر به المشتري، ولا يتحقق النظام من عمره أو من حضور ولي أمره.`} icon={<FileSignature />} tone="teal">
        <div data-testid="student-consents">
          {consents.length === 0 ? (
            <SoftNote>لا توجد موافقات مسجلة. الحسابات الأقدم من هذا السجل تُسأل عند شرائها التالي.</SoftNote>
          ) : (
            <Timeline>
              {consents.map((c, i) => (
                <TimelineItem key={c.id} tone="teal" icon={<FileSignature />} title={CONSENT_KIND_LABELS[c.kind]} meta={formatDateTime(c.created_at)} last={i === consents.length - 1}>
                  <span className="break-words">
                    النسخة <bdi dir="ltr">{c.document_version}</bdi>
                    {c.order_id ? (
                      <>
                        ، طلب{" "}
                        <Link href={`/admin/orders/${c.order_id}`} className="font-bold text-brand-700 underline underline-offset-4">
                          <bdi className="num">{c.order_number}</bdi>
                        </Link>
                      </>
                    ) : null}
                    {c.ip ? (
                      <>
                        ، IP <bdi dir="ltr">{c.ip}</bdi>
                      </>
                    ) : null}
                  </span>
                  {c.user_agent ? (
                    <bdi dir="ltr" className="mt-0.5 block text-[0.78rem] break-all text-muted">
                      {c.user_agent}
                    </bdi>
                  ) : null}
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </div>
      </Section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="سجل الوصول للمحتوى" description={`آخر ${ar(30)} عملية`} icon={<FileClock />} tone="sky">
          {access.length === 0 ? (
            <SoftNote>لا توجد عمليات.</SoftNote>
          ) : (
            <Timeline className="gap-0">
              {access.map((a, i) => {
                const st = ACCESS_STYLE[a.action] ?? { tone: "slate" as AdminTone, icon: <Eye /> };
                return (
                  <TimelineItem dense key={a.id} tone={st.tone} icon={st.icon} title={ACCESS_LABELS[a.action] ?? a.action} meta={formatDateTime(a.created_at)} last={i === access.length - 1}>
                    {a.title ?? <EmptyValue label="محتوى غير متوفر" />}
                  </TimelineItem>
                );
              })}
            </Timeline>
          )}
        </Section>
        <Section title="سجل التدقيق" description="إجراءات الإدارة على هذا الحساب" icon={<ClipboardList />} tone="slate">
          {auditTrail.length === 0 ? (
            <SoftNote>لا توجد إجراءات.</SoftNote>
          ) : (
            <Timeline>
              {auditTrail.map((a, i) => (
                <TimelineItem
                  key={a.id}
                  tone="slate"
                  icon={<ShieldCheck />}
                  title={<bdi dir="ltr">{a.action}</bdi>}
                  meta={`${a.actor_name ?? "النظام"}، ${formatDateTime(a.created_at)}`}
                  last={i === auditTrail.length - 1}
                >
                  {a.reason ? <>السبب: {a.reason}</> : null}
                </TimelineItem>
              ))}
            </Timeline>
          )}
        </Section>
      </div>

      {user.role === "student" && !anonymized ? (
        <Section title="حذف بيانات الطالب" icon={<Eraser />} tone="coral" description="عند طلب الطالب أو ولي أمره. يزيل ما يدل على الشخص، ويبقي السجلات المالية بلا هوية.">
          <StudentAnonymize userId={user.id} email={user.email} blockers={blockers} />
        </Section>
      ) : null}
    </div>
  );
}
