import { BadgeCheck, FileQuestionMark, FileText } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { pendingReviewCount, reviewQueue } from "@/server/admin/products";
import { pendingQuestionCount, questionReviewQueue } from "@/server/questions/bank";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { count } from "@/lib/design";
import { PageBand } from "../_components/overview/bands";
import { CONTENT } from "../_components/overview/money";
import { ReviewCard } from "../_components/overview/review-card";
import { PillTabs, type PillTab } from "../_components/catalog/pill-tabs";
import { QuestionReviewCard } from "../questions/_components/review-card";
import { QUESTION_WORD } from "@/server/questions/words";

export const metadata = { title: "مراجعة المحتوى" };

/** تبويبا المراجعة: المحتوى (الافتراضي، كما كان) والأسئلة (?tab=questions) */
function reviewTabs(active: "content" | "questions", contentCount: number, questionCount: number): PillTab[] {
  return [
    { href: "/admin/review", label: "المحتوى", active: active === "content", count: contentCount, tone: "gold", icon: <FileText aria-hidden /> },
    { href: "/admin/review?tab=questions", label: "الأسئلة", active: active === "questions", count: questionCount, tone: "violet", icon: <FileQuestionMark aria-hidden /> },
  ];
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireOwnerPage();
  const { tab } = await searchParams;

  if (tab === "questions") {
    const [questions, contentCount] = await Promise.all([questionReviewQueue(), pendingReviewCount()]);
    return (
      <div className="space-y-6">
        <PageBand tone="gold" art="review">
          <AdminPageHeader title="مراجعة المحتوى" description="أسئلة أرسلها المعلمون لبنك الأسئلة، راجع الصياغة والمرجع والإجابة والشرح، ثم اعتمدها أو أعدها بملاحظات." className="mb-0">
            <span className="chip chip-white min-h-9 px-3.5 text-[0.88rem]">
              <FileQuestionMark className="text-[#6A3FE0]" aria-hidden />
              {questions.length ? `${count(questions.length, QUESTION_WORD)} بالانتظار` : "لا شيء بالانتظار"}
            </span>
          </AdminPageHeader>
        </PageBand>
        <PillTabs items={reviewTabs("questions", contentCount, questions.length)} label="نوع المراجعة" />

        {questions.length === 0 ? (
          <div className="rounded-[1.75rem] border border-[rgb(23_32_38/0.06)] bg-surface p-4 shadow-card sm:p-6">
            <EmptyState icon={<FileQuestionMark />} title="لا توجد أسئلة بانتظار المراجعة" description="عندما يرسل المعلمون أسئلة جديدة لبنك الأسئلة ستظهر هنا." />
          </div>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {questions.map((q) => (
              <QuestionReviewCard key={q.id} item={q} />
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [items, questionCount] = await Promise.all([reviewQueue(), pendingQuestionCount()]);
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
      <PillTabs items={reviewTabs("content", items.length, questionCount)} label="نوع المراجعة" />

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
