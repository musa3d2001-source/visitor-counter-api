"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { SubjectGrid, SubjectTile, type SubjectTileData } from "@/components/site/subject-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { gradeClass } from "@/lib/design";
import { cn } from "@/lib/utils";
import s from "./home.module.css";

export type ExplorerTab = { id: string; slug: string; level: number; num: string; name: string; short: string };
type Subject = SubjectTileData & { id: string };

/**
 * «أو ادخل مادتك مباشرة»: تبويبات الصفوف (نمط ARIA tabs: الأسهم وHome/End).
 * الصفحة تحمل لوحة صف واحد مرسومة على الخادم، وبقية اللوحات تُطلب عند الاقتراب من التبويب.
 * كل تبويب رابط حقيقي لصفحة صفه: بلا JavaScript، ولمحركات البحث، وعند تعذر جلب اللوحة.
 */
export function SubjectExplorer({ tabs, initial, children }: { tabs: ExplorerTab[]; initial: number; children: ReactNode }) {
  const [active, setActive] = useState(initial);
  const [panels, setPanels] = useState<Record<string, Subject[]>>({});
  const base = useId();
  const router = useRouter();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const inFlight = useRef(new Set<string>());
  const activeRef = useRef(initial);

  function load(i: number) {
    const tab = tabs[i];
    if (i === initial || panels[tab.id] || inFlight.current.has(tab.id)) return;
    inFlight.current.add(tab.id);
    fetch(`/api/grades/${tab.id}/subjects`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`subjects ${res.status}`);
        const data = (await res.json()) as { subjects: Subject[] };
        setPanels((p) => ({ ...p, [tab.id]: data.subjects }));
      })
      .catch(() => {
        // الرابط يبقى صحيحًا: من ينتظر هذه اللوحة يذهب إلى صفحة صفه بدل هيكل لا ينتهي
        if (activeRef.current === i) router.push(`/grades/${tab.slug}`);
      })
      .finally(() => inFlight.current.delete(tab.id));
  }

  function select(i: number) {
    activeRef.current = i;
    setActive(i);
    load(i);
  }

  function onClick(e: MouseEvent<HTMLAnchorElement>, i: number) {
    // فتح الرابط في تبويب جديد يبقى كما هو
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    select(i);
  }

  function onKey(e: KeyboardEvent<HTMLAnchorElement>, i: number) {
    const n = tabs.length;
    // في الاتجاه من اليمين لليسار: السهم الأيسر = التالي
    const map: Record<string, number> = { ArrowLeft: (i + 1) % n, ArrowRight: (i - 1 + n) % n, Home: 0, End: n - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = map[e.key];
    select(next);
    refs.current[next]?.focus();
  }

  const tab = tabs[active];
  const list = panels[tab.id];
  const waiting = active !== initial && !list;

  return (
    <section className={s.explorer} aria-labelledby={`${base}-h`}>
      <div className={s.exHead}>
        <h3 className={s.exTitle} id={`${base}-h`}>
          أو ادخل مادتك مباشرة
        </h3>
        <div className={s.exTabs} role="tablist" aria-labelledby={`${base}-h`}>
          {tabs.map((g, i) => (
            <a
              key={g.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              href={`/grades/${g.slug}`}
              role="tab"
              id={`${base}-t${i}`}
              aria-selected={active === i}
              aria-controls={`${base}-panel`}
              tabIndex={active === i ? 0 : -1}
              className={cn(s.exTab, gradeClass(g.level))}
              onClick={(e) => onClick(e, i)}
              onKeyDown={(e) => onKey(e, i)}
              onPointerEnter={() => load(i)}
              onFocus={() => load(i)}
            >
              <span className={s.exTabNum} aria-hidden>
                {g.num}
              </span>
              <span className={s.exTabFull}>{g.name}</span>
              <span className={s.exTabShort} aria-hidden>
                {g.short}
              </span>
            </a>
          ))}
        </div>
      </div>
      <div key={tab.id} role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-t${active}`} aria-busy={waiting} className={s.exPanel} data-testid="subject-panel">
        {active === initial ? (
          children
        ) : list ? (
          <SubjectGrid>
            {list.map((x) => (
              <li key={x.id}>
                <SubjectTile subject={x} href={`/grades/${tab.slug}/${x.slug}`} />
              </li>
            ))}
          </SubjectGrid>
        ) : (
          <SubjectGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-[9.5rem] rounded-[22px]" />
              </li>
            ))}
          </SubjectGrid>
        )}
      </div>
    </section>
  );
}
