import Link from "next/link";
import { BadgeCheck, Clock } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { reviewQueue } from "@/server/admin/products";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { filsToKwdString } from "@/lib/money";
import { PRODUCT_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "مراجعة المحتوى" };

export default async function ReviewQueuePage() {
  await requireOwnerPage();
  const items = await reviewQueue();
  return (
    <div>
      <AdminPageHeader title="مراجعة المحتوى" description="محتوى أرسله المعلمون للنشر، راجعه، حدد السعر وفترة الإتاحة، ثم اعتمده أو أعده بملاحظات." />
      {items.length === 0 ? (
        <EmptyState icon={<BadgeCheck />} title="لا يوجد محتوى بانتظار المراجعة" description="عندما يرسل المعلمون محتوى جديدًا سيظهر هنا." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>المحتوى</TH>
              <TH>المعلم</TH>
              <TH>الصف / المادة</TH>
              <TH>المكونات</TH>
              <TH>السعر المقترح</TH>
              <TH>أُرسل</TH>
              <TH>إجراء</TH>
            </tr>
          </THead>
          <tbody>
            {items.map((p) => (
              <TR key={p.id}>
                <TD className="max-w-72">
                  <Link href={`/admin/products/${p.id}`} className="line-clamp-2 font-semibold hover:text-brand-700">
                    {p.title}
                  </Link>
                  <p className="text-xs text-muted">{PRODUCT_TYPE_LABELS[p.type]}</p>
                </TD>
                <TD>{p.teacher_name ?? "—"}</TD>
                <TD className="text-xs">
                  <p className="font-semibold text-ink-soft">{p.grade_name}</p>
                  <p className="text-muted">{p.subject_name ?? "—"}</p>
                </TD>
                <TD className="text-xs text-muted">
                  {[p.lessons ? `${p.lessons} درس` : null, p.files ? `${p.files} ملف` : null, p.items ? `${p.items} عنصر` : null].filter(Boolean).join("، ") || "—"}
                  {p.not_ready ? (
                    <Badge tone="warning" className="mt-1">
                      <Clock className="size-3" aria-hidden /> {p.not_ready} قيد المعالجة
                    </Badge>
                  ) : null}
                </TD>
                <TD className="whitespace-nowrap">{p.proposed_price_fils !== null ? <><span className="num">{filsToKwdString(p.proposed_price_fils)}</span> د.ك</> : "—"}</TD>
                <TD className="text-xs text-muted">{formatDateTime(p.submitted_at)}</TD>
                <TD>
                  <Button asChild size="sm">
                    <Link href={`/admin/products/${p.id}#review-h`}>مراجعة</Link>
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
