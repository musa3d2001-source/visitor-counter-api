"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "./home.module.css";

/**
 * رف بطاقات: شبكة على الشاشات الواسعة، وتحت ١١٠٠ بكسل صف أفقي قابل للسحب
 * مع زرّي تمرير ظاهرين وشريط تقدم (لا تعتمد الإشارة إلى المزيد على السحب وحده).
 */
export function Rail({ children, label, cols = 4, className }: { children: ReactNode; label: string; cols?: number; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [st, setSt] = useState({ start: true, end: false, ratio: 0, frac: 0.5, overflow: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setSt({
      start: pos < 4,
      end: max <= 0 || pos > max - 4,
      ratio: max > 0 ? Math.min(1, pos / max) : 0,
      frac: el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      overflow: max > 4,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  function go(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: (rtl ? -1 : 1) * dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  }

  const thumb: CSSProperties = {
    width: `${st.frac * 100}%`,
    transform: `translateX(${-st.ratio * (1 / st.frac - 1) * 100}%)`,
  };

  return (
    <div className={className}>
      <ul ref={ref} className={s.rail} style={{ "--cols": cols } as CSSProperties}>
        {children}
      </ul>
      {st.overflow ? (
        <div className={s.railNav}>
          <button type="button" className={s.railBtn} onClick={() => go(-1)} disabled={st.start} aria-label={`السابق من ${label}`}>
            <ArrowRight size={20} aria-hidden />
          </button>
          <span className={s.railTrack} aria-hidden>
            <span className={s.railThumb} style={thumb} />
          </span>
          <button type="button" className={cn(s.railBtn)} onClick={() => go(1)} disabled={st.end} aria-label={`التالي من ${label}`}>
            <ArrowLeft size={20} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
