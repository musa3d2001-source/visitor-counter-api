import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CircleCheck, KeyRound, Undo2 } from "lucide-react";
import { getStudent, grantableProducts } from "@/server/admin/records";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { OrderStatusBadge, TestBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { displayPhone } from "@/lib/phone";
import { ENTITLEMENT_SOURCE_LABELS, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { grantAction, revokeAction, setActiveAction } from "../actions";

export const metadata = { title: "ملف الطالب" };

const ACCESS_LABELS: Record<string, string> = { view: "قراءة", download: "تنزيل", preview: "معاينة", video: "مشاهدة فيديو", denied: "محاولة مرفوضة" };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, products] = await Promise.all([getStudent(id), grantableProducts()]);
  if (!data) notFound();
  const { user, orders, entitlements, access, auditTrail } = data;
  const active = entitlements.filter((e) => !e.revoked_at);
  const revoked = entitlements.filter((e) => e.revoked_at);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={user.full_name}
        description={user.role === "admin" ? "حساب مدير" : "حساب طالب"}
        crumbs={[{ label: "الطلاب", href: "/admin/students" }, { label: user.full_name }]}
        actions={
          user.is_active ? (
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
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="البريد" value={<span dir="ltr">{user.email}</span>} />
        <Info label="الهاتف" value={<span className="num">{user.phone ? displayPhone(user.phone) : "—"}</span>} />
        <Info label="الصف" value={user.grade_name ?? "—"} />
        <Info label="الحالة" value={user.is_active ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">موقوف</Badge>} />
        <Info label="تاريخ التسجيل" value={formatDateTime(user.created_at)} />
        <Info label="آخر دخول" value={formatDateTime(user.last_login_at)} />
        <Info label="صلاحيات نشطة" value={<span className="num">{active.length}</span>} />
        <Info label="عدد الطلبات" value={<span className="num">{orders.length}</span>} />
      </div>

      <Section title="الصلاحيات (المكتبة)" description="المنتجات التي يستطيع الطالب الوصول إليها. المنح والسحب اليدوي يتطلبان سببًا ويُسجلان في سجل التدقيق.">
        {active.length === 0 ? (
          <p className="mb-4 rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد صلاحيات نشطة.</p>
        ) : (
          <ul className="mb-5 divide-y divide-line rounded-xl border border-line">
            {active.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/products/${e.product_id}`} className="font-semibold hover:text-brand-700">
                    {e.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {PRODUCT_TYPE_LABELS[e.type as ProductType] ?? e.type} · {ENTITLEMENT_SOURCE_LABELS[e.source] ?? e.source}
                    {e.order_number ? (
                      <>
                        {" "}
                        · طلب <bdi className="num">{e.order_number}</bdi>
                      </>
                    ) : null}
                    {e.via_bundle_title ? ` · عبر «${e.via_bundle_title}»` : ""}
                    {e.grant_reason ? ` · السبب: ${e.grant_reason}` : ""} · <bdi>{formatDateTime(e.granted_at)}</bdi>
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-dashed border-line-strong p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <KeyRound className="size-4" aria-hidden /> منح صلاحية يدويًا
          </h3>
          <ActionForm action={grantAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="userId" value={user.id} />
            <Field label="المنتج" htmlFor="grant-product" required>
              <Select id="grant-product" name="productId" defaultValue="">
                <option value="">اختر المنتج</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.grade_name} — {p.title}
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
              <SubmitButton size="sm">منح الصلاحية</SubmitButton>
            </div>
          </ActionForm>
        </div>

        {revoked.length ? (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-muted">صلاحيات مسحوبة ({revoked.length})</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {revoked.map((e) => (
                <li key={e.id} className="rounded-lg bg-canvas px-3 py-2">
                  <span className="font-semibold">{e.title}</span> — سُحبت {formatDateTime(e.revoked_at)} · السبب: {e.revoke_reason ?? "—"}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section title="الطلبات">
        {orders.length === 0 ? (
          <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لا توجد طلبات.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>الطلب</TH>
                <TH>التاريخ</TH>
                <TH>الإجمالي</TH>
                <TH>الحالة</TH>
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
                  <TD className="num">{filsToKwdString(o.total_fils)} د.ك</TD>
                  <TD>
                    <div className="flex gap-1">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="سجل الوصول للمحتوى" description="آخر 30 عملية">
          {access.length === 0 ? (
            <p className="text-sm text-muted">لا توجد عمليات.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {access.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-2 rounded-lg bg-canvas px-3 py-2">
                  <Badge tone={a.action === "denied" ? "danger" : "neutral"}>{ACCESS_LABELS[a.action] ?? a.action}</Badge>
                  <span className="min-w-0 flex-1 truncate">{a.title ?? "—"}</span>
                  <span className="text-muted">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="سجل التدقيق" description="إجراءات الإدارة على هذا الحساب">
          {auditTrail.length === 0 ? (
            <p className="text-sm text-muted">لا توجد إجراءات.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {auditTrail.map((a) => (
                <li key={a.id} className="rounded-lg bg-canvas px-3 py-2">
                  <span className="font-semibold" dir="ltr">
                    {a.action}
                  </span>{" "}
                  · {a.actor_name ?? "النظام"} · {formatDateTime(a.created_at)}
                  {a.reason ? <p className="mt-0.5 text-ink-soft">السبب: {a.reason}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
