"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { gradeClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./home.module.css";

export type ExplorerTab = { id: string; level: number; num: string; name: string; short: string };

/**
 * «أو ادخل مادتك مباشرة»: تبويبات الصفوف (نمط ARIA tabs: الأسهم وHome/End) ولوحات مواد
 * تُرسم على الخادم وتُمرَّر هنا (روابط حقيقية لصفحات المواد).
 */
export function SubjectExplorer({ tabs, panels }: { tabs: ExplorerTab[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const n = tabs.length;
    // في الاتجاه من اليمين لليسار: السهم الأيسر = التالي
    const map: Record<string, number> = { ArrowLeft: (i + 1) % n, ArrowRight: (i - 1 + n) % n, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = map[e.key];
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <section className={s.explorer} aria-labelledby={`${base}-h`}>
      <div className={s.exHead}>
        <h3 className={s.exTitle} id={`${base}-h`}>
          أو ادخل مادتك مباشرة
        </h3>
        <div className={s.exTabs} role="tablist" aria-labelledby={`${base}-h`}>
          {tabs.map((g, i) => (
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
              className={cn(s.exTab, gradeClass(g.level))}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className={s.exTabNum} aria-hidden>
                {g.num}
              </span>
              <span className={s.exTabFull}>{g.name}</span>
              <span className={s.exTabShort} aria-hidden>
                {g.short}
              </span>
            </button>
          ))}
        </div>
      </div>
      {panels.map((panel, i) => (
        <div key={tabs[i]?.id ?? i} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} hidden={active !== i} className={s.exPanel}>
          {panel}
        </div>
      ))}
    </section>
  );
}
