import { BadgeCheck } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { reviewQueue } from "@/server/admin/products";
import { listPendingProfileChanges } from "@/server/admin/teacher-profile-review";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { count } from "@/lib/design";
import { PageBand } from "../_components/overview/bands";
import { CONTENT, PROFILE_EDIT } from "../_components/overview/money";
import { ReviewCard } from "../_components/overview/review-card";
import { ProfileChangeCard } from "../_components/overview/profile-change-card";
import { approveProfileChangeAction, rejectProfileChangeAction } from "./actions";

export const metadata = { title: "مراجعة المحتوى" };

export default async function ReviewQueuePage() {
  await requireOwnerPage();
  const [items, changes] = await Promise.all([reviewQueue(), listPendingProfileChanges()]);
  const waiting = [items.length ? count(items.length, CONTENT) : null, changes.length ? count(changes.length, PROFILE_EDIT) : null].filter(Boolean).join(" و");
  return (
    <div className="space-y-6">
      <PageBand tone="gold" art="review">
        <AdminPageHeader title="مراجعة المحتوى" description="محتوى أرسله المعلمون للنشر، راجعه، حدد السعر وفترة الإتاحة، ثم اعتمده أو أعده بملاحظات." className="mb-0">
          <span className="chip chip-white min-h-9 px-3.5 text-[0.88rem]">
            <BadgeCheck className="text-[#C98500]" aria-hidden />
            {waiting ? `${waiting} بالانتظار` : "لا شيء بالانتظار"}
          </span>
        </AdminPageHeader>
      </PageBand>

      {changes.length ? (
        <section aria-labelledby="profile-changes-h" className="space-y-3">
          <div>
            <h2 id="profile-changes-h" className="font-display text-[1.25rem] font-black text-ink">
              تعديلات ملفات المعلمين
            </h2>
            <p className="text-[0.9rem] leading-7 text-muted">لا يظهر التعديل في الصفحة العامة قبل اعتماده.</p>
          </div>
          <ul className="grid gap-4">
            {changes.map((c) => (
              <ProfileChangeCard key={c.id} change={c} approve={approveProfileChangeAction} reject={rejectProfileChangeAction} />
            ))}
          </ul>
        </section>
      ) : null}

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
