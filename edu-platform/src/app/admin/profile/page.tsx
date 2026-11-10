import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Camera, ExternalLink, EyeOff, PenLine } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { getTeacherAdmin, teacherSubjectsLabeled } from "@/server/admin/teachers";
import { teacherProfileState } from "@/server/admin/teacher-profile-review";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { FileUploader } from "@/components/admin/file-uploader";
import { QuickAction } from "@/components/admin/confirm-button";
import { StatusPill } from "@/components/admin/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { SubjectIcon } from "@/components/art";
import { subjectSlugFromName } from "@/components/site/card-parts";
import { initial, subjectVars } from "@/lib/design";
import { PageBand } from "../_components/overview/bands";
import { removeOwnPhotoAction, updateOwnProfileAction } from "./actions";

export const metadata = { title: "ملفي التعريفي" };

export default async function TeacherProfilePage() {
  const actor = await requireStaff();
  if (actor.kind !== "teacher") redirect("/admin/teachers");
  const teacher = await getTeacherAdmin(actor.teacherId);
  if (!teacher) redirect("/admin");
  const [subjects, { pending, rejected }] = await Promise.all([teacherSubjectsLabeled(teacher.id), teacherProfileState(teacher.id)]);
  const livePhoto = teacher.photo_key ? storage().publicUrl(teacher.photo_key) : null;
  const pendingPhoto = pending?.photo_key ? storage().publicUrl(pending.photo_key) : null;
  const removalPending = pending?.photo_action === "remove";
  const photo = pendingPhoto ?? (removalPending ? null : livePhoto);
  return (
    <div className="space-y-6">
      <PageBand tone="pink" art="profile">
        <AdminPageHeader
          title="ملفي التعريفي"
          description="يظهر للطلاب في صفحتك العامة"
          actions={
            teacher.is_published ? (
              <Button asChild variant="primary" size="md">
                <Link prefetch={false} href={`/teachers/${teacher.slug}`} target="_blank">
                  <ExternalLink aria-hidden /> صفحتي العامة
                </Link>
              </Button>
            ) : (
              <StatusPill tone="neutral" icon={<EyeOff aria-hidden />}>
                صفحتك غير منشورة بعد
              </StatusPill>
            )
          }
          className="mb-0"
        />
      </PageBand>

      {pending ? (
        <Alert tone="info" title="تعديلك بانتظار موافقة الإدارة" data-testid="profile-pending">
          صفحتك العامة تبقى على النسخة المعتمدة حتى الموافقة. يمكنك التعديل هنا من جديد، ويحل التعديل الجديد محل السابق.
        </Alert>
      ) : rejected ? (
        <Alert tone="warning" title="لم يُعتمد آخر تعديل" data-testid="profile-rejected">
          <span className="block break-words">ملاحظة الإدارة: {rejected.review_note}</span>
          <span className="block">صفحتك العامة باقية على النسخة المعتمدة، ويمكنك التعديل وإرساله من جديد.</span>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Section title={teacher.display_name} description="الاسم والرابط ونسبة الأرباح تحددها إدارة المنصة. أي تعديل هنا تراجعه الإدارة قبل أن يظهر للطلاب." icon={<PenLine />} tone="pink">
          <ActionForm action={updateOwnProfileAction} className="space-y-4">
            <Field label="العنوان التعريفي" htmlFor="headline" hint="سطر قصير يظهر تحت اسمك">
              <Input id="headline" name="headline" defaultValue={pending?.headline ?? teacher.headline} maxLength={140} />
            </Field>
            <Field label="نبذة عنك" htmlFor="bio">
              <Textarea id="bio" name="bio" defaultValue={pending?.bio ?? teacher.bio} rows={6} maxLength={3000} />
            </Field>
            <SubmitButton>إرسال للمراجعة</SubmitButton>
          </ActionForm>
          {subjects.length ? (
            <div className="mt-6 border-t border-dashed border-line-strong pt-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[1rem] font-black text-ink">
                <BookOpen className="size-4.5 text-[#C42F86]" aria-hidden /> المواد التي تدرّسها
              </h3>
              <ul className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const slug = subjectSlugFromName(s.subject_name);
                  return (
                    <li key={s.subject_id} style={subjectVars(slug)} className="chip min-h-9 gap-2 ps-1.5 pe-3.5 text-[0.88rem]">
                      <span className="grid size-6 place-items-center rounded-full bg-linear-to-br from-[var(--a)] to-[var(--b)] text-white" aria-hidden>
                        <SubjectIcon slug={slug ?? undefined} size={14} />
                      </span>
                      {s.subject_name}، {s.grade_name}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Section>

        <section
          aria-labelledby="photo-h"
          className="relative isolate overflow-hidden rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-5 text-center shadow-card"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-br from-[#FF85B8] to-[#C42F86]" aria-hidden />
          <span className="pointer-events-none absolute -end-8 -top-10 -z-10 size-32 rounded-full border-[14px] border-white/20" aria-hidden />
          <h2 id="photo-h" className="flex items-center justify-center gap-2 font-display text-[1.05rem] font-black text-white">
            <Camera className="size-4.5" aria-hidden /> صورتك
          </h2>
          <div className="relative mx-auto mt-4 mb-4 grid size-32 place-items-center overflow-hidden rounded-full bg-linear-to-br from-[#FFC2DD] to-[#FF85B8] font-display text-[3rem] font-black text-white shadow-[0_0_0_6px_#fff,0_18px_30px_-14px_rgb(150_34_103/0.6)]">
            {photo ? <Image src={photo} alt="" fill sizes="128px" className="object-cover" /> : <span aria-hidden>{initial(teacher.display_name)}</span>}
          </div>
          {pendingPhoto || removalPending ? (
            <div className="mb-3" data-testid="photo-pending">
              <StatusPill tone="info">{removalPending ? "طلب الإزالة بانتظار الموافقة" : "بانتظار الموافقة"}</StatusPill>
            </div>
          ) : null}
          <div className="text-start">
            <FileUploader target="teacher_photo" teacherId={teacher.id} accept="image/jpeg,image/png,image/webp" label={photo ? "تغيير الصورة" : "رفع صورة"} hint="صورة مربعة، حتى 5 م.ب" compact />
          </div>
          {photo ? (
            <div className="mt-2">
              <QuickAction action={removeOwnPhotoAction} label={pendingPhoto && !livePhoto ? "إلغاء الصورة المعلقة" : "طلب إزالة الصورة"} variant="ghost" />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
