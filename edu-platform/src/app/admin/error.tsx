"use client";

import Link from "next/link";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { Sparkle } from "@/components/art";
import { Button } from "@/components/ui/button";
import { DB_BUSY_MESSAGE, DB_BUSY_TITLE, isBusyDigest } from "@/lib/busy";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const busy = isBusyDigest(error.digest);
  return (
    <div className="relative isolate mx-auto max-w-xl overflow-hidden rounded-[2rem] border-2 border-white bg-[linear-gradient(165deg,#fff_20%,#ffe7df)] px-6 py-10 text-center shadow-[0_6px_0_#f6d3c7,0_30px_50px_-34px_rgb(180_50_42/0.55)] sm:px-10">
      <span className="pointer-events-none absolute -end-16 -top-20 -z-10 size-56 rounded-full border-[20px] border-white/60" aria-hidden />
      <Sparkle className="pointer-events-none absolute start-8 top-8 size-5" color="#FF6B5A" />
      <Sparkle className="pointer-events-none absolute end-10 bottom-10 size-4" />
      <span className="mx-auto grid size-16 place-items-center rounded-[1.25rem] bg-linear-to-br from-[#FFA07A] to-[#E8483F] text-white shadow-[inset_0_-4px_0_rgb(0_0_0/0.14),0_14px_24px_-12px_#B4322A]">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-[1.7rem] leading-snug font-black text-ink" data-testid={busy ? "busy-title" : undefined}>
        {busy ? DB_BUSY_TITLE : "تعذر تحميل هذه الصفحة"}
      </h1>
      <p className="mx-auto mt-2 max-w-[44ch] text-[0.95rem] leading-7 text-ink-soft">
        {busy ? DB_BUSY_MESSAGE : "حدث خطأ أثناء جلب البيانات. يمكنك إعادة المحاولة، وإن تكرر الخطأ راجع سجلات الخادم."}
      </p>
      {error.digest && !busy ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs text-muted shadow-xs">
          رمز الخطأ: <span className="num font-semibold text-ink-soft">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} size="lg">
          <RotateCcw aria-hidden /> إعادة المحاولة
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/admin">
            <House aria-hidden /> الرئيسية
          </Link>
        </Button>
      </div>
    </div>
  );
}
