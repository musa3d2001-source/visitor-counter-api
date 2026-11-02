"use client";

import { useState } from "react";
import { ListVideo, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** قائمة الدروس: شريط جانبي على الكمبيوتر، ودرج قابل للطي على الجوال */
export function LessonsPanel({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3 font-bold shadow-card lg:hidden"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="lessons-panel"
        data-testid="open-lessons"
      >
        <span className="flex items-center gap-2">
          <ListVideo className="size-5 text-brand-600" aria-hidden /> {title}
        </span>
        <span className="text-sm font-normal text-muted">{count}</span>
      </button>
      {open ? <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside
        id="lessons-panel"
        className={cn(
          "flex flex-col overflow-hidden border-line bg-surface",
          "fixed inset-x-0 bottom-0 z-50 max-h-[78dvh] rounded-t-3xl border-t shadow-lift transition-transform duration-300 lg:static lg:z-auto lg:max-h-[calc(100dvh-7rem)] lg:translate-y-0 lg:rounded-2xl lg:border lg:shadow-card",
          open ? "translate-y-0" : "translate-y-full",
        )}
        aria-label="قائمة الدروس"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <span className="text-sm text-muted lg:inline">{count}</span>
          <button className="grid size-9 place-items-center rounded-lg hover:bg-brand-50 lg:hidden" onClick={() => setOpen(false)} aria-label="إغلاق قائمة الدروس">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto" onClick={() => setOpen(false)}>
          {children}
        </div>
      </aside>
    </>
  );
}
