import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, GraduationCap } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { getTeacherAdmin, teacherSubjectsLabeled } from "@/server/admin/teachers";
import { storage } from "@/server/storage";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { FileUploader } from "@/components/admin/file-uploader";
import { QuickAction } from "@/components/admin/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeOwnPhotoAction, updateOwnProfileAction } from "./actions";

export const metadata = { title: "ملفي التعريفي" };

export default async function TeacherProfilePage() {
  const actor = await requireStaff();
  if (actor.kind !== "teacher") redirect("/admin/teachers");
  const teacher = await getTeacherAdmin(actor.teacherId);
  if (!teacher) redirect("/admin");
  const subjects = await teacherSubjectsLabeled(teacher.id);
  const photo = teacher.photo_key ? storage().publicUrl(teacher.photo_key) : null;
  return (
    <div className="max-w-4xl space-y-6">
      <AdminPageHeader
        title="ملفي التعريفي"
        description="يظهر للطلاب في صفحتك العامة"
        actions={
          teacher.is_published ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/teachers/${teacher.slug}`} target="_blank">
                <ExternalLink aria-hidden /> صفحتي العامة
              </Link>
            </Button>
          ) : (
            <Badge tone="neutral">صفحتك غير منشورة بعد</Badge>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
        <Section title={teacher.display_name} description="الاسم والرابط ونسبة الأرباح تحددها إدارة المنصة.">
          <ActionForm action={updateOwnProfileAction} className="space-y-4">
            <Field label="العنوان التعريفي" htmlFor="headline" hint="سطر قصير يظهر تحت اسمك">
              <Input id="headline" name="headline" defaultValue={teacher.headline} maxLength={140} />
            </Field>
            <Field label="نبذة عنك" htmlFor="bio">
              <Textarea id="bio" name="bio" defaultValue={teacher.bio} rows={6} maxLength={3000} />
            </Field>
            <SubmitButton>حفظ</SubmitButton>
          </ActionForm>
          {subjects.length ? (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-bold">المواد التي تدرّسها</p>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <Badge key={s.subject_id} tone="neutral">
                    {s.subject_name} — {s.grade_name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Section>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 font-bold">صورتك</h2>
          <div className="relative mx-auto mb-3 grid size-32 place-items-center overflow-hidden rounded-full bg-brand-50 text-brand-700">
            {photo ? <Image src={photo} alt="" fill sizes="128px" className="object-cover" /> : <GraduationCap className="size-10" aria-hidden />}
          </div>
          <FileUploader target="teacher_photo" teacherId={teacher.id} accept="image/jpeg,image/png,image/webp" label={photo ? "تغيير الصورة" : "رفع صورة"} hint="صورة مربعة · حتى 5 م.ب" compact />
          {photo ? (
            <div className="mt-2">
              <QuickAction action={removeOwnPhotoAction} label="إزالة الصورة" variant="ghost" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
