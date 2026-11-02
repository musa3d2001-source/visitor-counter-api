import Link from "next/link";
import { Package, Pencil, Plus } from "lucide-react";
import { listBundlesAdmin } from "@/server/admin/products";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";

export const metadata = { title: "الباقات" };

export default async function BundlesPage() {
  const bundles = await listBundlesAdmin();
  return (
    <div>
      <AdminPageHeader
        title="الباقات"
        description="الباقة منتج يجمع عدة مذكرات من نفس الصف بسعر واحد. لا تُكرر الصلاحيات للمنتجات المتداخلة."
        actions={
          <Button asChild>
            <Link href="/admin/products/new?type=bundle">
              <Plus aria-hidden /> باقة جديدة
            </Link>
          </Button>
        }
      />
      {bundles.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="لا توجد باقات بعد"
          description="أنشئ باقة مثل «باقة المراجعة النهائية» أو «باقة الصف كاملًا» ثم أضف إليها المذكرات."
          action={
            <Button asChild>
              <Link href="/admin/products/new?type=bundle">إنشاء باقة</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>الباقة</TH>
              <TH>الصف</TH>
              <TH>المحتويات</TH>
              <TH>قيمة المحتويات</TH>
              <TH>سعر الباقة</TH>
              <TH>التوفير</TH>
              <TH>المبيعات</TH>
              <TH>الحالة</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {bundles.map((b) => {
              const saving = b.items_total - b.price_fils;
              return (
                <TR key={b.id}>
                  <TD className="font-semibold">
                    <Link href={`/admin/products/${b.id}`} className="hover:text-brand-700">
                      {b.title}
                    </Link>
                  </TD>
                  <TD>{b.grade_name}</TD>
                  <TD>
                    <span className="num">{b.item_count}</span> منتج
                  </TD>
                  <TD className="num">{filsToKwdString(b.items_total)}</TD>
                  <TD className="num font-semibold">{filsToKwdString(b.price_fils)}</TD>
                  <TD className={saving > 0 ? "num text-success" : "num text-muted"}>{saving > 0 ? filsToKwdString(saving) : "—"}</TD>
                  <TD className="num">{b.sold}</TD>
                  <TD>
                    <ProductStatusBadge status={b.status} />
                  </TD>
                  <TD>
                    <Button asChild size="icon" variant="ghost">
                      <Link href={`/admin/products/${b.id}`} aria-label={`تعديل ${b.title}`}>
                        <Pencil aria-hidden />
                      </Link>
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
