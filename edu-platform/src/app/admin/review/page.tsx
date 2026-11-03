import { BadgeCheck } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { reviewQueue } from "@/server/admin/products";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { count } from "@/lib/design";
import { PageBand } from "../_components/overview/bands";
import { CONTENT } from "../_components/overview/money";
import { ReviewCard } from "../_components/overview/review-card";

export const metadata = { title: "مراجعة المحتوى" };

export default async function ReviewQueuePage() {
  await requireOwnerPage();
  const items = await reviewQueue();
  return (
    <div className="space-y-6">
      <PageBand tone="gold" art="review">
        <AdminPageHeader title="مراجعة المحتوى" description="محتوى أرسله المعلمون للنشر، راجعه، حدد السعر وفترة الإتاحة، ثم اعتمده أو أعده بملاحظات." className="mb-0">
          <span className="chip chip-white min-h-9 px-3.5 text-[0.88rem]">
            <BadgeCheck className="text-[#C98500]" aria-hidden />
            {items.length ? `${count(items.length, CONTENT)} بالانتظار` : "لا شيء بالانتظار"}
          </span>
        </AdminPageHeader>
      </PageBand>

      {items.length === 0 ? (
        <div className="rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-6">
          <EmptyState icon={<BadgeCheck />} title="لا يوجد محتوى بانتظار المراجعة" description="عندما يرسل المعلمون محتوى جديدًا سيظهر هنا." />
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {items.map((p) => (
            <ReviewCard key={p.id} item={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
