import Link from "next/link";
import { Check, GraduationCap, Shapes } from "lucide-react";
import type { TeacherCard } from "@/server/catalog/queries";
import { Sparkle, SubjectIcon } from "@/components/art";
import { TeacherAvatar } from "@/components/site/teacher-avatar";
import { ar, gradeClass, SUBJECT_ORDER, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./teachers.module.css";

export { s as teacherStyles };

/** مواقع الوجوه حول الشمس (نسب مئوية من المربع) وأحجامها */
const FACES = [
  { x: 50, y: 47, size: 150 },
  { x: 16, y: 26, size: 96 },
  { x: 84, y: 24, size: 104 },
  { x: 18, y: 78, size: 100 },
  { x: 82, y: 80, size: 92 },
];
const BUBBLES = [
  { x: 47, y: 2 },
  { x: 2, y: 50 },
  { x: 88, y: 50 },
  { x: 48, y: 88 },
];

/**
 * رسم جانبي للبطل من بيانات حقيقية: وجوه المعلمين المنشورين (صورة أو الحرف الأول) حول شمس،
 * وفقاعات أيقونات المواد التي يدرّسونها فعلًا. زخرفي بالكامل (aria-hidden).
 */
export function TeachersCollage({ teachers }: { teachers: TeacherCard[] }) {
  const faces = teachers.slice(0, FACES.length);
  const slugs = SUBJECT_ORDER.filter((slug) => teachers.some((t) => t.subjects.some((x) => x.slug === slug))).slice(0, BUBBLES.length);
  return (
    <div className={s.collage} aria-hidden>
      <span className={s.orbit} />
      <span className={s.sun} />
      {slugs.map((slug, i) => (
        <span key={slug} className={cn(s.bubble, toneClass(slug))} style={{ left: `${BUBBLES[i].x}%`, top: `${BUBBLES[i].y}%` }}>
          <SubjectIcon slug={slug} size={26} />
        </span>
      ))}
      {faces.map((t, i) => {
        const slug = t.subjects[0]?.slug ?? null;
        const f = FACES[i];
        return (
          <span key={t.id} className={cn(s.face, toneClass(slug))} style={{ left: `${f.x}%`, top: `${f.y}%` }}>
            <TeacherAvatar name={t.name} photoUrl={t.photoUrl} size={f.size} subjectSlug={slug} ring="lg" decorative />
            {slug ? (
              <span className={s.faceBadge}>
                <SubjectIcon slug={slug} size={16} strokeWidth={2.4} />
              </span>
            ) : null}
          </span>
        );
      })}
      <Sparkle className={cn(s.collageSpark, "animate-twinkle")} />
      <span className={s.collageSpark2}>
        <Sparkle className="animate-twinkle size-full [animation-delay:1.1s]" color="#17A398" />
      </span>
      <span className={s.collageSpark3}>
        <Sparkle className="animate-twinkle size-full [animation-delay:.6s]" color="#FF6B5A" />
      </span>
    </div>
  );
}

/** كبسولة تصفية: رقم الصف أو أيقونة المادة في مربع ملون، والحالية مميزة بإطار ولون */
export function FilterPill({
  href,
  label,
  active,
  grade,
  subjectSlug,
  subjectIcon,
  all,
}: {
  href: string;
  label: string;
  active: boolean;
  grade?: number;
  subjectSlug?: string;
  subjectIcon?: string | null;
  all?: "grades" | "subjects";
}) {
  const tone = grade != null ? gradeClass(grade) : subjectSlug ? toneClass(subjectSlug) : "tone-brand";
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn(s.fpill, active && s.fpillActive, tone)}>
      {grade != null ? (
        <span className="num-tile" aria-hidden>
          {ar(grade)}
        </span>
      ) : (
        <span className="icon-tile" aria-hidden>
          {all === "grades" ? <GraduationCap /> : all === "subjects" ? <Shapes /> : <SubjectIcon slug={subjectSlug} name={subjectIcon} size={18} />}
        </span>
      )}
      {label}
      {active ? <Check className={s.check} aria-hidden /> : null}
    </Link>
  );
}

/** صف وجوه متراكبة للجوال (بديل الرسم الجانبي الذي يظهر على الحاسوب فقط) */
export function TeacherFaces({ teachers }: { teachers: TeacherCard[] }) {
  return (
    <div className={cn(s.faces, "lg:hidden")} aria-hidden>
      {teachers.slice(0, 5).map((t) => (
        <span key={t.id} className={toneClass(t.subjects[0]?.slug ?? null)}>
          <TeacherAvatar name={t.name} photoUrl={t.photoUrl} size={58} subjectSlug={t.subjects[0]?.slug ?? null} ring decorative />
        </span>
      ))}
      <Sparkle className={s.facesSpark} />
    </div>
  );
}
