import { CircleCheck, ScrollText } from "lucide-react";
import { requireStaff } from "@/server/auth/permissions";
import { latestAgreementAcceptance } from "@/server/admin/teacher-agreement";
import { AdminPageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/admin/action-form";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { ar } from "@/lib/design";
import { TEACHER_AGREEMENT_DRAFT_NOTICE, TEACHER_AGREEMENT_SECTIONS } from "@/lib/teacher-agreement";
import { formatDateTime } from "@/lib/utils";
import { PageBand } from "../_components/overview/bands";
import { acceptAgreementAction } from "./actions";

export const metadata = { title: "اتفاقية المعلم" };

/** المعلم يقرؤها ويقبلها، والمالك يراها للاطلاع فقط */
export default async function TeacherAgreementPage() {
  const actor = await requireStaff();
  const acceptance = actor.kind === "teacher" ? await latestAgreementAcceptance(actor.userId) : null;
  return (
    <div className="space-y-6">
      <PageBand tone="violet" art="review">
        <AdminPageHeader className="mb-0" title="اتفاقية المعلم" description={
            <>
              النسخة <bdi dir="ltr">{CONSENT_VERSIONS.teacher_agreement}</bdi>
            </>
          } />
      </PageBand>

      <Alert tone="warning" title="مسودة بانتظار مراجعة محامٍ" data-testid="agreement-draft">
        {TEACHER_AGREEMENT_DRAFT_NOTICE}
      </Alert>

      {acceptance?.isCurrent ? (
        <Alert tone="success" title="قبلت هذه النسخة">
          سُجل قبولك في {formatDateTime(acceptance.acceptedAt)}.
        </Alert>
      ) : acceptance ? (
        <Alert tone="info" title="تغيرت الاتفاقية منذ آخر قبول">
          قبلت النسخة <bdi dir="ltr">{acceptance.version}</bdi> في {formatDateTime(acceptance.acceptedAt)}. راجع هذه النسخة واقبلها قبل إرسالك التالي للمراجعة. محتواك الحالي يبقى كما هو.
        </Alert>
      ) : null}

      <Section title="نص الاتفاقية" icon={<ScrollText />} tone="violet">
        <ol className="space-y-4" data-testid="agreement-text">
          {TEACHER_AGREEMENT_SECTIONS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-[0.8rem] bg-linear-to-br from-[#B28CFF] to-[#6A3FE0] font-display text-[1rem] font-black text-white" aria-hidden>
                {ar(i + 1)}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[1.05rem] font-extrabold text-ink">{s.title}</h3>
                <p className="mt-0.5 text-[0.95rem] leading-8 text-ink-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {actor.kind === "teacher" && !acceptance?.isCurrent ? (
        <Section title="قبول الاتفاقية" icon={<CircleCheck />} tone="green">
          <ActionForm action={acceptAgreementAction} className="space-y-3">
            <Checkbox name="accept" required data-testid="agreement-accept" className="items-start text-[0.95rem] leading-7" label="قرأت الاتفاقية وأوافق عليها." />
            <SubmitButton size="lg">قبول الاتفاقية</SubmitButton>
            <p className="text-[0.82rem] leading-6 text-muted">تُحفظ النسخة ووقت القبول في سجل حسابك. محتواك الموجود حاليًا لا يتأثر.</p>
          </ActionForm>
        </Section>
      ) : null}
    </div>
  );
}
