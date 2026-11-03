import { FileText, Layers, PlayCircle } from "lucide-react";
import type * as React from "react";
import { ToneIcon, type ToneIconSize } from "@/components/admin/icon-tile";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { initial } from "@/lib/design";
import { filsToKwdString } from "@/lib/money";
import { cn } from "@/lib/utils";
import { KIND_TONE, personTone, productKind } from "./helpers";

/** مبلغ بالدينار: أرقام لاتينية داخل ‎.num‎ ثم «د.ك» */
export function Kwd({ fils, className, unitClassName, ...rest }: { fils: number; className?: string; unitClassName?: string } & React.ComponentProps<"span">) {
  return (
    <span className={cn("whitespace-nowrap", className)}>
      <span className="num" {...rest}>
        {filsToKwdString(fils)}
      </span>{" "}
      <span className={cn("text-[0.8em] font-bold text-muted", unitClassName)}>د.ك</span>
    </span>
  );
}

/** مربع أيقونة لنوع المنتج: فيديو أزرق، مذكرة مرجانية، باقة ذهبية */
export function TypeIcon({ type, size = "sm", className }: { type: string; size?: ToneIconSize; className?: string }) {
  const kind = productKind(type);
  const Icon = kind === "video" ? PlayCircle : kind === "bundle" ? Layers : FileText;
  return (
    <ToneIcon tone={KIND_TONE[kind]} size={size} className={className}>
      <Icon />
    </ToneIcon>
  );
}

/** رسالة فراغ صغيرة داخل لوح (أصغر من EmptyState) */
export function SoftNote({ children, icon, className }: { children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex min-h-14 items-center justify-center gap-2 rounded-[1.25rem] border-2 border-dashed border-line-strong bg-[linear-gradient(180deg,#fffaf2,#fff4e4)] px-4 py-3 text-center font-display text-[0.92rem] font-bold text-muted [&_svg]:size-4 [&_svg]:text-brand-600",
        className,
      )}
    >
      {icon}
      {children}
    </p>
  );
}

/**
 * صورة رمزية بالحرف الأول على تدرج ملوّن ثابت لكل اسم. زخرفية (الاسم مكتوب بجوارها دائمًا).
 * ring: حلقة بيضاء وهالة ملوّنة (للبطاقات والرؤوس).
 */
export function PersonAvatar({
  name,
  size = 48,
  tone,
  ring,
  className,
}: {
  name: string;
  size?: number;
  tone?: AdminTone;
  ring?: boolean | "lg";
  className?: string;
}) {
  const t = tone ?? personTone(name);
  const shadow =
    ring === "lg"
      ? "0 0 0 5px #fff, 0 0 0 9px color-mix(in oklab, var(--a) 40%, white), 0 20px 30px -14px var(--d)"
      : ring
        ? "0 0 0 3px #fff, 0 8px 16px -8px var(--d)"
        : "inset 0 -3px 0 rgb(0 0 0 / 0.12)";
  return (
    <span
      aria-hidden
      style={{
        ...toneStyle(t),
        width: size,
        height: size,
        fontSize: Math.max(14, Math.round(size * 0.42)),
        lineHeight: 1,
        backgroundImage: "radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.42), transparent 48%), linear-gradient(145deg, var(--a), var(--b))",
        boxShadow: shadow,
        textShadow: size >= 64 ? "0 3px 10px rgb(0 0 0 / 0.18)" : undefined,
      }}
      className={cn("grid shrink-0 place-items-center rounded-full font-display font-black text-[var(--icon)]", className)}
    >
      {initial(name)}
    </span>
  );
}

/** خط زمني عمودي بنقاط ملوّنة (أحداث الطلب، سجل الوصول، التدقيق) */
export function Timeline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ol className={cn("relative flex flex-col gap-1", className)}>{children}</ol>;
}

export function TimelineItem({
  tone = "teal",
  icon,
  title,
  meta,
  children,
  last,
  dense,
}: {
  tone?: AdminTone;
  icon: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  last?: boolean;
  /** صف مضغوط بسطر واحد (للسجلات الطويلة) */
  dense?: boolean;
}) {
  if (dense) {
    return (
      <li className="relative flex min-h-12 items-center gap-2.5 border-b border-dashed border-line py-1.5 last:border-0">
        <ToneIcon tone={tone} size="xs" className="rounded-full">
          {icon}
        </ToneIcon>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.84rem] leading-6">
            <span className="font-display font-extrabold text-ink">{title}</span>
            {children ? <span className="text-ink-soft"> · {children}</span> : null}
          </p>
          {meta ? <p className="text-[0.72rem] leading-5 text-muted sm:hidden">{meta}</p> : null}
        </div>
        {meta ? <p className="hidden shrink-0 text-[0.74rem] text-muted sm:block">{meta}</p> : null}
      </li>
    );
  }
  return (
    <li className="relative flex gap-3 pb-3">
      {!last ? <span className="absolute start-[1.2rem] top-11 bottom-0 w-0.5 rounded-full bg-[repeating-linear-gradient(180deg,var(--color-line-strong)_0_6px,transparent_6px_11px)]" aria-hidden /> : null}
      <ToneIcon tone={tone} size="sm" className="relative z-[1] mt-0.5 rounded-full">
        {icon}
      </ToneIcon>
      <div className="min-w-0 flex-1 rounded-[1.1rem] bg-canvas/70 px-3.5 py-2.5 ring-1 ring-line ring-inset">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <p className="min-w-0 font-display text-[0.92rem] leading-6 font-extrabold text-ink">{title}</p>
          {meta ? <p className="text-[0.78rem] leading-5 text-muted">{meta}</p> : null}
        </div>
        {children ? <div className="mt-0.5 text-[0.84rem] leading-6 text-ink-soft">{children}</div> : null}
      </div>
    </li>
  );
}

/** كبسولة صغيرة ملوّنة بلون من ألوان اللوحة */
export function TonePill({ tone = "teal", icon, children, className }: { tone?: AdminTone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span style={toneStyle(tone)} className={cn("chip min-h-7 [&_svg]:text-[var(--b)]", className)}>
      {icon}
      {children}
    </span>
  );
}

/** رقم صغير بعنوان (داخل البطاقات): ‎label‎ فوق ‎value‎ */
export function Metric({ label, value, tone = "teal", className }: { label: string; value: React.ReactNode; tone?: AdminTone; className?: string }) {
  return (
    <div style={toneStyle(tone)} className={cn("min-w-0 rounded-2xl bg-[var(--soft)] px-3 py-2", className)}>
      <p className="flex items-center gap-1.5 font-display text-[0.74rem] leading-5 font-bold text-[var(--tink)]">
        <span className="size-1.5 shrink-0 rounded-full bg-[var(--b)]" aria-hidden />
        {label}
      </p>
      <div className="mt-0.5 truncate font-display text-[1.02rem] leading-tight font-black text-ink">{value}</div>
    </div>
  );
}
