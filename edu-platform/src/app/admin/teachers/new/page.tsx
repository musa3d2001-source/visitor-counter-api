import { KeyRound, UserRoundPlus, UserCog } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { subjectOptions } from "@/server/admin/teachers";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { TeacherForm } from "@/components/admin/teacher-form";
import { createTeacherAction } from "../actions";
import { BandChip, BandChips, PeopleBand } from "../../_components/people/band";
import { TeachersArt } from "../../_components/people/art";

export const metadata = { title: "إضافة معلم" };

export default async function NewTeacherPage() {
  await requireOwnerPage();
  const subjects = await subjectOptions();
  return (
    <div className="space-y-6">
      <PeopleBand
        tone="pink"
        art={<TeachersArt className="size-full motion-safe:animate-bob" />}
        footer={
          <BandChips>
            <BandChip tone="gold" icon={<UserCog aria-hidden />}>
              يبدأ بوضع «يديره المالك»
            </BandChip>
            <BandChip tone="teal" icon={<KeyRound aria-hidden />}>
              تفعيل حساب الدخول لاحقًا من صفحته
            </BandChip>
          </BandChips>
        }
      >
        <AdminPageHeader
          className="mb-0"
          title="إضافة معلم"
          description="يُنشأ المعلم بوضع «يديره المالك»، يمكنك بعدها تفعيل حساب دخول له من صفحته."
          crumbs={[{ label: "المعلمون", href: "/admin/teachers" }, { label: "إضافة معلم" }]}
        />
      </PeopleBand>
      <Section title="ملف المعلم" icon={<UserRoundPlus />} tone="pink" description="الحقول المعلّمة بنجمة إلزامية، والباقي يمكن تعديله لاحقًا.">
        <TeacherForm
          action={createTeacherAction}
          subjects={subjects}
          submitLabel="حفظ المعلم"
          defaults={{ slug: "", displayName: "", headline: "", bio: "", isPublished: false, canUpload: true, revenueShare: "", sortOrder: "0", subjectIds: [] }}
        />
      </Section>
    </div>
  );
}
