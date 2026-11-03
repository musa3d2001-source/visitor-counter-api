"use client";

/**
 * «ادخل مادتك مباشرة»: تبويبات الصفوف (نمط ARIA tabs كامل: أسهم، Home/End)
 * ومربعات المواد الملونة بروابط حقيقية لصفحة المادة.
 */
import Link from "next/link";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { SubjectIcon } from "./art";
import s from "./v2c.module.css";

export type TabGrade = {
  id: string;
  slug: string;
  name: string;
  short: string;
  num: string;
  vars: CSSProperties;
  subjects: { id: string; slug: string; name: string; countLabel: string; vars: CSSProperties }[];
};

export function SubjectTabs({ grades }: { grades: TabGrade[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = grades.length;
    // في الاتجاه من اليمين لليسار: السهم الأيسر = التالي
    const map: Record<string, number> = { ArrowLeft: (i + 1) % n, ArrowRight: (i - 1 + n) % n, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = map[e.key];
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className={s.explorer}>
      <div className={s.exHead}>
        <h3 className={s.h3} id={`${base}-h`}>
          أو ادخل مادتك مباشرة
        </h3>
        <div className={s.exTabs} role="tablist" aria-labelledby={`${base}-h`}>
          {grades.map((g, i) => (
            <button
              key={g.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-t${i}`}
              aria-selected={active === i}
              aria-controls={`${base}-p${i}`}
              tabIndex={active === i ? 0 : -1}
              className={s.exTab}
              style={g.vars}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className={s.exTabNum} aria-hidden>
                {g.num}
              </span>
              <span className={s.exTabFull}>{g.name}</span>
              <span className={s.exTabShort}>{g.short}</span>
            </button>
          ))}
        </div>
      </div>
      {grades.map((g, i) => (
        <div
          key={g.id}
          role="tabpanel"
          id={`${base}-p${i}`}
          aria-labelledby={`${base}-t${i}`}
          hidden={active !== i}
          className={s.exPanel}
        >
          <ul className={s.exList}>
            {g.subjects.map((x) => (
              <li key={x.id}>
                <Link href={`/grades/${g.slug}/${x.slug}`} className={s.subj} style={x.vars}>
                  <span className={s.subjIcon}>
                    <SubjectIcon slug={x.slug} size={26} />
                  </span>
                  <span className={s.subjText}>
                    <b>{x.name}</b>
                    <small>{x.countLabel}</small>
                  </span>
                  <span className={s.subjGo} aria-hidden>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
