import { requireOwnerPage } from "@/server/auth/permissions";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { listStudents } from "@/server/admin/records";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { displayPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "الطلاب" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireOwnerPage();
  const sp = await searchParams;
  const students = await listStudents(sp.q?.slice(0, 80));
  return (
    <div>
      <AdminPageHeader title="الطلاب" description="حسابات الطلاب ومشترياتهم وصلاحياتهم" />
      <form className="mb-5 flex gap-2 rounded-lg border border-line bg-surface p-3" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" defaultValue={sp.q} placeholder="ابحث بالاسم أو البريد أو الهاتف" className="ps-9" aria-label="بحث" />
        </div>
        <Button type="submit" variant="secondary">
          بحث
        </Button>
      </form>
      {students.length === 0 ? (
        <EmptyState icon={<Users />} title={sp.q ? "لا توجد نتائج" : "لا يوجد طلاب بعد"} description={sp.q ? "جرّب كلمة بحث أخرى." : "ستظهر هنا حسابات الطلاب بعد التسجيل."} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>الطالب</TH>
              <TH>الهاتف</TH>
              <TH>الصف</TH>
              <TH>طلبات مدفوعة</TH>
              <TH>صلاحيات نشطة</TH>
              <TH>التسجيل</TH>
              <TH>الحالة</TH>
            </tr>
          </THead>
          <tbody>
            {students.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link href={`/admin/students/${s.id}`} className="font-semibold hover:text-brand-700">
                    {s.full_name}
                  </Link>
                  <p className="text-xs text-muted" dir="ltr">
                    {s.email}
                  </p>
                </TD>
                <TD className="num text-sm">{s.phone ? displayPhone(s.phone) : "—"}</TD>
                <TD className="text-sm">{s.grade_name ?? "—"}</TD>
                <TD className="num">{s.paid_orders}</TD>
                <TD className="num">{s.active_entitlements}</TD>
                <TD className="text-xs text-muted">{formatDate(s.created_at)}</TD>
                <TD>{s.is_active ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">موقوف</Badge>}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
