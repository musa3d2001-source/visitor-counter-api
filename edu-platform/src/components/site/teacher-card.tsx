import Link from "next/link";
import type { TeacherCard as TeacherCardData } from "@/server/catalog/queries";
import { TeacherAvatar } from "./teacher-avatar";
import { formatTotalDuration, lessonsLabel } from "./format";

/** بطاقة معلم أفقية: الصورة/الحرف، الاسم بخط العرض، التعريف، المواد والصفوف، وحجم المحتوى */
export function TeacherCard({ teacher, anchor }: { teacher: TeacherCardData; anchor?: string }) {
  const subjects = [...new Map(teacher.subjects.map((s) => [`${s.name}|${s.gradeName}`, s])).values()].slice(0, 3);
  const stats = [teacher.videoCount ? lessonsLabel(teacher.videoCount).replace("درس", "درس مرئي").replace("دروس", "دروس مرئية") : "", formatTotalDuration(teacher.totalDurationSeconds)].filter(Boolean);
  return (
    <article data-testid="teacher-card" className="group relative grid grid-cols-[4rem_1fr] gap-4 py-5">
      <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={64} />
      <div className="min-w-0">
        <h3 className="font-display text-[1.6rem] leading-tight font-semibold">
          <Link href={`/teachers/${teacher.slug}${anchor ? `#${anchor}` : ""}`} className="after:absolute after:inset-0 group-hover:text-brand-700 focus-visible:outline-none">
            {teacher.name}
          </Link>
        </h3>
        {teacher.headline ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{teacher.headline}</p> : null}
        {subjects.length ? (
          <p className="mt-2 text-sm text-ink-soft">
            {subjects.map((s) => `${s.name} ${s.gradeName.replace("الصف ", "")}`).join("، ")}
          </p>
        ) : null}
        {stats.length ? <p className="mt-1 text-xs text-muted">{stats.join("، ")}</p> : null}
      </div>
    </article>
  );
}

export function TeacherGrid({ teachers, columns = 3 }: { teachers: TeacherCardData[]; columns?: 2 | 3 }) {
  return (
    <ul className={`grid border-t border-line md:grid-cols-2 md:gap-x-12 ${columns === 3 ? "lg:grid-cols-3" : ""}`}>
      {teachers.map((t) => (
        <li key={t.id} className="border-b border-line">
          <TeacherCard teacher={t} />
        </li>
      ))}
    </ul>
  );
}
