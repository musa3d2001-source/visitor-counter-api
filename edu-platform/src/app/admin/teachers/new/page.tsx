import { requireOwnerPage } from "@/server/auth/permissions";
import { subjectOptions } from "@/server/admin/teachers";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TeacherForm } from "@/components/admin/teacher-form";
import { createTeacherAction } from "../actions";

export const metadata = { title: "إضافة معلم" };

export default async function NewTeacherPage() {
  await requireOwnerPage();
  const subjects = await subjectOptions();
  return (
    <div className="max-w-4xl">
      <AdminPageHeader
        title="إضافة معلم"
        description="يُنشأ المعلم بوضع «يديره المالك»، يمكنك بعدها تفعيل حساب دخول له من صفحته."
        crumbs={[{ label: "المعلمون", href: "/admin/teachers" }, { label: "إضافة معلم" }]}
      />
      <div className="rounded-lg border border-line bg-surface p-4 sm:p-6">
        <TeacherForm
          action={createTeacherAction}
          subjects={subjects}
          submitLabel="حفظ المعلم"
          defaults={{ slug: "", displayName: "", headline: "", bio: "", isPublished: false, canUpload: true, revenueShare: "", sortOrder: "0", subjectIds: [] }}
        />
      </div>
    </div>
  );
}
