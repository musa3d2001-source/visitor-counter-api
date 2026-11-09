import Link from "next/link";
import { ArrowLeft, ChevronDown, MessageCircle, Zap } from "lucide-react";
import { Sparkle, StepArt } from "@/components/art";
import { SectionHead } from "@/components/ui/section-head";
import { ar, gradeClass } from "@/lib/design";
import { homeSteps, paymentClaims, type SiteFacts } from "@/lib/site-truth";
import { cn } from "@/lib/utils";
import type { HeroGrade } from "./hero";
import s from "./home.module.css";

const STEP_TONES = [s.s1, s.s2, s.s3, s.s4];

/** خطوات البدء: نصها يتبع ما هو صحيح الآن عن الدفع والمحتوى. الموقع الفارغ لا خطوات له */
export function HowSteps({ facts }: { facts: SiteFacts }) {
  if (!facts.content) return null;
  return (
    <section className={cn(s.section, s.how)} aria-labelledby="how-title" id="how">
      <div className={s.wrap}>
        <SectionHead id="how-title" icon={<Zap size={16} />} eyebrow="سهلة وواضحة" title={<>كيف تبدأ؟ <span className="text-hl">أربع خطوات</span></>} />
        <ol className={s.steps}>
          {homeSteps(facts).map((x, i) => (
            <li key={x.t} className={cn(s.step, STEP_TONES[i])}>
              <span className={s.stepArt} aria-hidden>
                <StepArt n={i + 1} />
                <span className={s.stepNum}>{ar(i + 1)}</span>
              </span>
              <h3 className={s.stepTitle}>{x.t}</h3>
              <p className={s.stepText}>{x.p}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function HomeFaq({ faq, whatsapp, hasContact }: { faq: { q: string; a: string }[]; whatsapp: string; hasContact: boolean }) {
  if (!faq.length) return null;
  const wa = whatsapp.replace(/\D/g, "");
  return (
    <section className={s.section} aria-labelledby="faq-title" id="faq">
      <div className={cn(s.wrap, s.faqGrid)}>
        <div className={s.faqHead}>
          <SectionHead
            id="faq-title"
            icon={<MessageCircle size={16} />}
            eyebrow="عندك سؤال؟"
            tone="coral"
            title="الأسئلة الشائعة"
            sub="كل ما يهمك عن الشراء والمكتبة، بإجابات مختصرة."
            className="sm:mb-8"
          />
        </div>
        <div className={s.faqList}>
          {faq.map((f, i) => (
            <details key={i} className={s.faq} open={i === 0}>
              <summary>
                <span className={s.faqQ}>{f.q}</span>
                <span className={s.faqChev} aria-hidden>
                  <ChevronDown size={20} />
                </span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        {hasContact ? (
          <div className={cn(s.helpCard, "on-dark")}>
            <span className={s.helpIcon} aria-hidden>
              <MessageCircle size={26} />
            </span>
            <h3 className={s.helpTitle}>لم تجد إجابتك؟</h3>
            <p>راسلنا ونساعدك في أي شيء يخص الشراء أو المحتوى.</p>
            <a href={wa ? `https://wa.me/${wa}` : "/contact"} className="btn btn-3d btn-accent btn-md mt-5">
              تواصل معنا
              <ArrowLeft aria-hidden />
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** الدعوة الختامية: لوح فيروزي مشمس وأزرار الصفوف الأربعة */
export function ClosingCta({ grades, facts }: { grades: HeroGrade[]; facts: SiteFacts }) {
  if (!grades.length) return null;
  return (
    <section className={cn(s.section, s.ctaSec)} aria-labelledby="cta-title">
      <div className={s.wrap}>
        <div className={cn(s.cta, "bg-teal-night on-dark")}>
          <div className={s.ctaSun} aria-hidden />
          <Sparkle className={s.ctaSpark1} color="#FFE29A" />
          <Sparkle className={s.ctaSpark2} color="#fff" />
          <div className={s.ctaText}>
            <h2 id="cta-title" className="h-section text-white">
              جاهز تبدأ؟ <span className="text-gold">اختر صفك الآن</span>
            </h2>
            <p>ابدأ بالمعاينة المجانية حيث تتوفر{paymentClaims(facts.payment).afterConfirm ? "، وكل ما تشتريه تجده في «مكتبتي» بعد تأكيد الدفع" : ""}.</p>
          </div>
          <ul className={s.ctaGrades}>
            {grades.map((g) => (
              <li key={g.id}>
                <Link href={`/grades/${g.slug}`} className={cn(s.ctaGrade, gradeClass(g.level))}>
                  <span className={s.ctaNum} aria-hidden>
                    {ar(g.level)}
                  </span>
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
