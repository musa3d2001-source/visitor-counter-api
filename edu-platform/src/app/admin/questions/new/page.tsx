import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { curriculumOptions } from "@/server/questions/curriculum";
import { AdminPageHeader } from "@/components/admin/page-header";
import { QuestionForm } from "@/components/admin/question-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ar } from "@/lib/design";
import { CatalogBand } from "../../_components/catalog/band";
import { QuestionsArt } from "../_components/art";
import { emptyQuestionDefaults } from "../_components/form-defaults";
import { createQuestionAction } from "../actions";

export const metadata = { title: "إضافة سؤال" };

export default async function NewQuestionPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const actor = await requireStaff();
  const owner = actor.kind === "owner";
  const sp = await searchParams;
  const crumbs = [{ label: owner ? "بنك الأسئلة" : "أسئلتي", href: "/admin/questions" }, { label: "إضافة سؤال" }];

  if (actor.kind === "teacher" && !actor.canUpload) {
    return (
      <div className="max-w-3xl space-y-6">
        <CatalogBand tone="violet">
          <AdminPageHeader className="mb-0 sm:mb-0" title="إضافة سؤال" crumbs={crumbs} />
        </CatalogBand>
        <Alert tone="warning" title="صلاحية الإضافة موقوفة">
          تواصل مع إدارة المنصة لإعادة تفعيل صلاحية إضافة المحتوى. أسئلتك الحالية لم تتأثر.
        </Alert>
      </div>
    );
  }

  const options = await curriculumOptions(actor);
  // درس محدد مسبقًا من الرابط (?lesson=) إن كان ضمن ما يحق للفاعل
  const lessonId =
    sp.lesson && options.some((tb) => tb.units.some((u) => u.lessons.some((l) => l.id === sp.lesson))) ? sp.lesson : "";

  return (
    <div className="max-w-5xl space-y-6">
      <CatalogBand tone="violet" art={<QuestionsArt />}>
        <AdminPageHeader
          className="mb-0 sm:mb-0"
          title="إضافة سؤال"
          description={
            owner
              ? "اربط السؤال بدرسه وصفحته في الكتاب، واكتبه بصياغة معدّلة مع شرح الإجابة. يُحفظ مسودة ثم تعتمده للنشر."
              : "اربط السؤال بدرسه وصفحته في الكتاب، واكتبه بصياغتك مع شرح الإجابة. يُحفظ مسودة ثم ترسله للمراجعة."
          }
          crumbs={crumbs}
        >
          <ol className="flex flex-wrap gap-2" aria-label="مراحل الإضافة">
            {(owner ? ["كتابة السؤال", "المعاينة", "الاعتماد والنشر"] : ["كتابة السؤال", "المعاينة", "الإرسال للمراجعة"]).map((label, i) => (
              <li key={label} className={i === 0 ? "chip chip-gold min-h-9 px-3" : "chip chip-white min-h-9 px-3"}>
                <span className="grid size-5 place-items-center rounded-full bg-white/70 text-[0.72rem] font-black text-ink" aria-hidden>
                  {ar(i + 1)}
                </span>
                {label}
                {i === 0 ? <span className="sr-only"> (الخطوة الحالية)</span> : null}
              </li>
            ))}
          </ol>
        </AdminPageHeader>
      </CatalogBand>

      {options.length === 0 ? (
        <EmptyState
          art="library"
          headingLevel={2}
          title={owner ? "أضف الكتاب ودروسه أولًا" : "لا توجد كتب لموادك بعد"}
          description={
            owner
              ? "كل سؤال مرتبط بدرس في الكتاب المدرسي وصفحة منه. أضف الكتاب من صفحة «المنهج» ثم وحداته ودروسه بنطاق صفحاتها."
              : "تضيف إدارة المنصة الكتب المدرسية لموادك مع وحداتها ودروسها، وبعدها تستطيع كتابة الأسئلة هنا."
          }
          action={
            owner ? (
              <Button asChild>
                <Link href="/admin/curriculum">
                  <BookOpenText aria-hidden /> فتح صفحة المنهج
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/admin/questions">العودة إلى أسئلتي</Link>
              </Button>
            )
          }
        />
      ) : (
        <QuestionForm mode="create" action={createQuestionAction} options={options} defaults={emptyQuestionDefaults(lessonId)} />
      )}
    </div>
  );
}
