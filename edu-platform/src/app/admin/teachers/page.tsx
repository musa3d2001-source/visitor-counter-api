import Image from "next/image";
import Link from "next/link";
import { GraduationCap, Plus, Search } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { listTeachersAdmin } from "@/server/admin/teachers";
import { storage } from "@/server/storage";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";

export const metadata = { title: "المعلمون" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const teachers = await listTeachersAdmin(sp.q?.slice(0, 80));
  return (
    <div>
      <AdminPageHeader
        title="المعلمون"
        description="ملفات المعلمين العامة، حساباتهم، صلاحيات الرفع، ونسب الأرباح"
        actions={
          <Button asChild>
            <Link href="/admin/teachers/new">
              <Plus aria-hidden /> إضافة معلم
            </Link>
          </Button>
        }
      />
      <form className="mb-5 flex gap-2 rounded-2xl border border-line bg-surface p-3" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="ابحث بالاسم أو البريد" className="ps-9" aria-label="بحث" />
        </div>
        <Button type="submit" variant="secondary">
          بحث
        </Button>
      </form>
      {teachers.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title={sp.q ? "لا توجد نتائج" : "لا يوجد معلمون بعد"}
          description="أضف معلمًا: يمكنك إدارة محتواه بنفسك، أو تفعيل حساب له ليرفع شروحه بنفسه."
          action={
            <Button asChild>
              <Link href="/admin/teachers/new">إضافة معلم</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>المعلم</TH>
              <TH>طريقة الإدارة</TH>
              <TH>المحتوى</TH>
              <TH>المبيعات</TH>
              <TH>الرصيد المستحق</TH>
              <TH>الحالة</TH>
            </tr>
          </THead>
          <tbody>
            {teachers.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link href={`/admin/teachers/${t.id}`} className="flex items-center gap-3 font-semibold hover:text-brand-700">
                    <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-700">
                      {t.photo_key ? <Image src={storage().publicUrl(t.photo_key)} alt="" fill sizes="40px" className="object-cover" /> : <GraduationCap className="size-5" aria-hidden />}
                    </span>
                    <span>
                      {t.display_name}
                      <span className="block text-xs font-normal text-muted">{t.headline || "—"}</span>
                    </span>
                  </Link>
                </TD>
                <TD className="text-xs">
                  {t.mode === "self_managed" ? (
                    <>
                      <Badge tone="brand">حساب معلم</Badge>
                      <p className="mt-1 text-muted" dir="ltr">
                        {t.account_email}
                      </p>
                    </>
                  ) : (
                    <Badge tone="neutral">يديره المالك</Badge>
                  )}
                </TD>
                <TD className="text-xs text-muted">
                  <span className="num">{t.published_products}</span> منشور من <span className="num">{t.products}</span>
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  <span className="num font-semibold">{t.paid_items}</span> عملية ·{" "}
                  <span className="num">{filsToKwdString(Number(t.paid_gross))}</span> د.ك
                </TD>
                <TD className="whitespace-nowrap">
                  {t.revenue_share_bps === null ? (
                    <span className="text-xs text-muted">غير مفعّل</span>
                  ) : (
                    <>
                      <span className="num font-semibold">{filsToKwdString(t.balance)}</span> د.ك
                      <p className="text-xs text-muted">
                        نسبة <span className="num">{(t.revenue_share_bps / 100).toString()}</span>%
                      </p>
                    </>
                  )}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {t.is_published ? <Badge tone="success">صفحة ظاهرة</Badge> : <Badge tone="neutral">صفحة مخفية</Badge>}
                    {!t.can_upload ? <Badge tone="warning">الرفع موقوف</Badge> : null}
                    {t.mode === "self_managed" && t.account_active === false ? <Badge tone="danger">الحساب معطّل</Badge> : null}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
