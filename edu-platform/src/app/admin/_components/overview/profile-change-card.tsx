import type * as React from "react";
import { UserRoundPen } from "lucide-react";
import { ConfirmButton, QuickAction } from "@/components/admin/confirm-button";
import { ToneIcon } from "@/components/admin/icon-tile";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import type { PendingProfileChange } from "@/server/admin/teacher-profile-review";
import { storage } from "@/server/storage";
import { cn, formatDateTime } from "@/lib/utils";

function Column({ label, tone, children }: { label: string; tone: "live" | "new"; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-[1.25rem] p-3.5", tone === "live" ? "bg-canvas" : "bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] ring-1 ring-[#F0C766] ring-inset")}>
      <p className="font-display text-[0.82rem] font-extrabold text-muted">{label}</p>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

function Value({ label, value, same }: { label: string; value: string; same?: boolean }) {
  return (
    <div>
      <p className="text-[0.75rem] font-bold text-muted">{label}</p>
      <p className={cn("text-[0.92rem] leading-7 break-words whitespace-pre-line", same ? "text-muted" : "text-ink")}>{same ? "بدون تغيير" : value || "فارغ"}</p>
    </div>
  );
}

/** المالك يرى المعتمد الحالي والمقترح جنبًا إلى جنب، والجوال يكدسهما */
export function ProfileChangeCard({ change, approve, reject }: { change: PendingProfileChange; approve: React.ComponentProps<typeof QuickAction>["action"]; reject: React.ComponentProps<typeof ConfirmButton>["action"] }) {
  const livePhoto = change.current_photo_key ? storage().publicUrl(change.current_photo_key) : null;
  const newPhoto = change.photo_key ? storage().publicUrl(change.photo_key) : null;
  return (
    <li className="rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-5" data-testid="profile-change">
      <div className="flex items-start gap-3">
        <ToneIcon tone="pink" size="md">
          <UserRoundPen />
        </ToneIcon>
        <div className="min-w-0">
          <h3 className="font-display text-[1.1rem] leading-snug font-black text-ink">{change.display_name}</h3>
          <p className="text-[0.82rem] leading-6 text-muted">أُرسل في {formatDateTime(change.submitted_at)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Column label="المعتمد الآن (يراه الطلاب)" tone="live">
          <Value label="العنوان التعريفي" value={change.current_headline} />
          <Value label="النبذة" value={change.current_bio} />
          <div>
            <p className="text-[0.75rem] font-bold text-muted">الصورة</p>
            <TeacherAvatar name={change.display_name} photoUrl={livePhoto} size={72} className="mt-1" />
          </div>
        </Column>
        <Column label="المقترح" tone="new">
          <Value label="العنوان التعريفي" value={change.headline ?? ""} same={change.headline === null} />
          <Value label="النبذة" value={change.bio ?? ""} same={change.bio === null} />
          <div>
            <p className="text-[0.75rem] font-bold text-muted">الصورة</p>
            {change.photo_action === "none" ? (
              <p className="text-[0.92rem] leading-7 text-muted">بدون تغيير</p>
            ) : change.photo_action === "remove" ? (
              <p className="text-[0.92rem] leading-7 text-ink">إزالة الصورة</p>
            ) : (
              <TeacherAvatar name={change.display_name} photoUrl={newPhoto} size={72} className="mt-1" />
            )}
          </div>
        </Column>
      </div>
      <div className="mt-4 flex flex-wrap items-start gap-2.5">
        <QuickAction action={approve} hidden={{ id: change.id }} label="اعتماد ونشر التعديل" variant="primary" size="md" />
        <ConfirmButton
          action={reject}
          hidden={{ id: change.id }}
          label="رفض"
          variant="outline"
          size="md"
          title="رفض هذا التعديل؟"
          description="تبقى الصفحة العامة على النسخة المعتمدة، وتظهر ملاحظتك للمعلم."
          requireReason
          reasonLabel="سبب الرفض (يظهر للمعلم)"
          confirmLabel="رفض التعديل"
        />
      </div>
    </li>
  );
}
