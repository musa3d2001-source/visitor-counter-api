"use client";

/**
 * شريط إتمام الشراء الثابت على الجوال (أصغر من lg): الإجمالي وزر الشراء دائمًا في متناول الإبهام.
 * يختفي حين يظهر زر ملخص الطلب نفسه أو يُتجاوز، فلا يغطي التذييل ولا يكرر الزر.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kwd } from "./commerce";

export function MobileCheckoutBar({ targetId, totalFils, saved, label, href = "/checkout" }: { targetId: string; totalFils: number; saved?: React.ReactNode; label: string; href?: string }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    // يظهر الشريط فقط ما دام زر الملخص أسفل الشاشة ولم يصل إليه الطالب بعد
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 rounded-t-[1.5rem] border-t border-line bg-[rgb(255_248_236/0.94)] px-4 pt-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_40px_-20px_rgb(23_32_38/0.35)] backdrop-blur-xl transition-transform duration-300 motion-reduce:transition-none lg:hidden no-print",
        "before:absolute before:inset-x-6 before:top-0 before:h-1 before:rounded-b-md before:bg-[linear-gradient(90deg,#ff6b5a,#ffc531,#18b9a7,#4d8dff,#9b5cf6)]",
        show ? "translate-y-0" : "pointer-events-none translate-y-[110%]",
      )}
      aria-hidden={!show}
      inert={!show}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-bold text-ink-soft">الإجمالي</p>
          <Kwd fils={totalFils} className="text-[1.45rem] leading-tight text-brand-800" unitClassName="text-[0.55em]" />
          {saved}
        </div>
        <Link prefetch={false} href={href} className="btn btn-3d btn-primary btn-lg shrink-0">
          {label}
          <ArrowLeft aria-hidden />
        </Link>
      </div>
    </div>
  );
}
