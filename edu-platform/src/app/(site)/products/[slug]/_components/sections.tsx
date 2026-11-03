import type * as React from "react";
import { Check, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "./product.module.css";

/** لوح قسم أبيض بعنوان h2 وأيقونة متدرجة بلون المادة (يرث ‎--a/--b‎ من الأب) */
export function SectionPanel({
  id,
  title,
  icon,
  aside,
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  icon: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", s.sectionPanel, className)} aria-labelledby={id}>
      <div className={cn(s.secHead, "flex-wrap justify-between")}>
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="icon-tile [&_svg]:size-5.5">{icon}</span>
          <h2 id={id} className={s.secTitle}>
            {title}
          </h2>
        </div>
        {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** قائمة «ماذا ستتعلم/ماذا تحتوي» كبطاقات صغيرة بلون المادة الفاتح */
export function LearnList({ items }: { items: string[] }) {
  return (
    <ul className={s.learn}>
      {items.map((c) => (
        <li key={c} className={s.learnItem}>
          <span className={s.learnCheck} aria-hidden>
            <Check strokeWidth={3} />
          </span>
          <span>{c}</span>
        </li>
      ))}
    </ul>
  );
}

/** حقائق المنتج: مربعات أيقونة ملونة + تسمية + قيمة */
export function FactGrid({ facts }: { facts: { k: string; v: React.ReactNode; icon: React.ReactNode; tone: string }[] }) {
  return (
    <dl className={s.facts}>
      {facts.map((f) => (
        <div key={f.k} className={s.fact}>
          <span className={cn("icon-tile", s.factIcon, f.tone)} aria-hidden>
            {f.icon}
          </span>
          <div className="min-w-0">
            <dt>{f.k}</dt>
            <dd>{f.v}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** قائمة الملفات المرفقة: أيقونة ورقة ملونة، العنوان، وعدد الصفحات */
export function FileList({ files }: { files: { id: string; title: string; pages: string | null }[] }) {
  return (
    <ul className="grid gap-2.5">
      {files.map((f) => (
        <li key={f.id} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-[#fffaf2] px-3 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--soft)] text-[var(--tink)]" aria-hidden>
            <FileText className="size-5" />
          </span>
          <span className="min-w-0 flex-1 font-display font-bold text-ink">{f.title}</span>
          {f.pages ? <span className="chip shrink-0">{f.pages}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** عنوان قسم عريض خارج الألواح (أجزاء الدورة، ضمن باقة) */
export function WideHead({ id, eyebrow, eyebrowIcon, title, sub, tone = "" }: { id: string; eyebrow: string; eyebrowIcon: React.ReactNode; title: React.ReactNode; sub?: string; tone?: "" | "eyebrow-gold" | "eyebrow-violet" | "eyebrow-coral" }) {
  return (
    <div className="mb-7">
      <span className={cn("eyebrow-pill", tone)}>
        <span className="eyebrow-icon">{eyebrowIcon}</span>
        {eyebrow}
      </span>
      <h2 id={id} className="h-section mt-3">
        {title}
      </h2>
      {sub ? <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-8 text-muted">{sub}</p> : null}
    </div>
  );
}
