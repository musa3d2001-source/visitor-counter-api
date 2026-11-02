import Link from "next/link";
import { Clock, PlayCircle } from "lucide-react";
import type { TeacherCard as TeacherCardData } from "@/server/catalog/queries";
import { TeacherAvatar } from "./teacher-avatar";
import { formatTotalDuration } from "./format";

export function TeacherCard({ teacher, anchor }: { teacher: TeacherCardData; anchor?: string }) {
  const subjects = [...new Map(teacher.subjects.map((s) => [s.name, s])).values()].slice(0, 3);
  const grades = [...new Set(teacher.subjects.map((s) => s.gradeName))];
  return (
    <article
      data-testid="teacher-card"
      className="group relative flex flex-col items-center rounded-2xl border border-line bg-surface p-5 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
    >
      <TeacherAvatar name={teacher.name} photoUrl={teacher.photoUrl} size={84} />
      <h3 className="mt-3 text-base font-bold">
        <Link href={`/teachers/${teacher.slug}${anchor ? `#${anchor}` : ""}`} className="after:absolute after:inset-0 focus-visible:outline-none">
          {teacher.name}
        </Link>
      </h3>
      {teacher.headline ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{teacher.headline}</p> : null}
      {subjects.length ? (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {subjects.map((s) => (
            <span key={s.name} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[0.7rem] font-semibold text-brand-700">
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      {grades.length ? <p className="mt-2 text-[0.7rem] text-muted">{grades.join(" · ")}</p> : null}
      <div className="mt-auto flex items-center gap-3 pt-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1">
          <PlayCircle className="size-3.5 text-brand-600" aria-hidden /> <span className="num">{teacher.videoCount}</span> فيديو
        </span>
        {teacher.totalDurationSeconds ? (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5 text-brand-600" aria-hidden /> {formatTotalDuration(teacher.totalDurationSeconds)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function TeacherGrid({ teachers }: { teachers: TeacherCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {teachers.map((t) => (
        <TeacherCard key={t.id} teacher={t} />
      ))}
    </div>
  );
}
