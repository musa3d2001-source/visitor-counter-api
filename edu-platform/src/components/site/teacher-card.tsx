import Link from "next/link";
import { ArrowLeft, Clock3, Layers, MonitorPlay } from "lucide-react";
import type { TeacherCard as TeacherCardData } from "@/server/catalog/queries";
import { SubjectArt, SubjectIcon } from "@/components/art";
import { count, toneClass, W } from "@/lib/design";
import { cn } from "@/lib/utils";
import { catalogStyles as s } from "./card-parts";
import { TeacherAvatar } from "./teacher-avatar";
import { formatTotalDuration } from "./format";

/**
 * بطاقة المعلم «الفصل المشمس» (v2-c TeacherTile): شريط بتدرج مادته الأولى ورسمها، صورة كبيرة بحلقة
 * (أو الحرف الأول) مع شارة المادة الذهبية، الاسم، التعريف، كبسولات المواد بألوانها والصفوف،
 * أرقام حقيقية (الدروس المرئية، المحتوى، المدة) إن وُجدت، وزر «صفحة المعلم».
 */
export function TeacherCard({ teacher: t, anchor, headingLevel = 3, showDuration }: { teacher: TeacherCardData; anchor?: string; headingLevel?: 2 | 3 | 4; showDuration?: boolean }) {
  const H = `h${headingLevel}` as "h3";
  const first = t.subjects[0];
  const subjects = [...new Map(t.subjects.map((x) => [x.slug ?? x.name, x])).values()].slice(0, 3);
  const grades = [...new Map(t.subjects.map((x) => [x.gradeSlug, x])).values()].sort((a, b) => a.gradeLevel - b.gradeLevel).map((x) => x.gradeName);
  const total = formatTotalDuration(t.totalDurationSeconds);
  const hasStats = t.videoCount > 0 || t.productCount > 0;
  return (
    <article data-testid="teacher-card" className={cn(s.cardBase, s.tcard, toneClass(first?.slug))}>
      <div className={s.tcover} aria-hidden>
        <span className={s.tcoverArt}>
          <SubjectArt slug={first?.slug} />
        </span>
      </div>
      <div className={s.tavatarWrap}>
        <TeacherAvatar name={t.name} photoUrl={t.photoUrl} size={104} inheritTone ring="lg" decorative />
        {first ? (
          <span className={s.tbadge} aria-hidden>
            <SubjectIcon slug={first.slug} size={16} strokeWidth={2.4} />
          </span>
        ) : null}
      </div>
      <H className={s.tname}>
        <Link prefetch={false} href={`/teachers/${t.slug}${anchor ? `#${anchor}` : ""}`} className="stretched rounded-[28px]">
          {t.name}
        </Link>
      </H>
      {t.headline ? <p className={s.theadline}>{t.headline}</p> : null}
      {subjects.length || grades.length ? (
        <ul className={s.tchips} aria-label="المواد والصفوف">
          {subjects.map((x) => (
            <li key={x.id} className={toneClass(x.slug)}>
              {x.name}
            </li>
          ))}
          {grades.slice(0, 3).map((g) => (
            <li key={g} className={s.tgrade}>
              {g}
            </li>
          ))}
        </ul>
      ) : (
        <span className="mb-4" />
      )}
      {hasStats ? (
        <div className={s.tstats}>
          {t.videoCount > 0 ? (
            <span>
              <MonitorPlay aria-hidden />
              {count(t.videoCount, W.videoLesson)}
            </span>
          ) : null}
          {t.productCount > 0 ? (
            <span>
              <Layers aria-hidden />
              {count(t.productCount, W.product)}
            </span>
          ) : null}
          {showDuration && total ? (
            <span>
              <Clock3 aria-hidden />
              {total}
            </span>
          ) : null}
        </div>
      ) : null}
      <span className={cn(s.footBtn, !hasStats && "mt-auto")} aria-hidden>
        صفحة المعلم
        <ArrowLeft />
      </span>
    </article>
  );
}

/** شبكة بطاقات المعلمين: عمودان أو ثلاثة أو أربعة على الشاشات الكبيرة */
export function TeacherGrid({ teachers, columns = 3, className }: { teachers: TeacherCardData[]; columns?: 2 | 3 | 4; className?: string }) {
  return (
    <ul
      className={cn(
        "grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 sm:gap-6",
        columns >= 3 && "lg:grid-cols-3",
        columns === 4 && "xl:grid-cols-4",
        className,
      )}
    >
      {teachers.map((t) => (
        <li key={t.id} className="min-w-0">
          <TeacherCard teacher={t} />
        </li>
      ))}
    </ul>
  );
}
