"use client";

import Link from "next/link";
import { House, MessagesSquare, RotateCw } from "lucide-react";
import { Sparkle } from "@/components/art";
import { Button } from "@/components/ui/button";
import { DB_BUSY_MESSAGE, DB_BUSY_TITLE, isBusyDigest } from "@/lib/busy";

/** رسم «انقطع الاتصال»: قابس وسلك مفصولان فوق شمس دافئة، مع شرارة صغيرة. زخرفي. */
function UnpluggedArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" className={className} width="100%" height="100%" aria-hidden focusable="false">
      <circle cx="120" cy="86" r="74" fill="#FFC531" opacity=".14" />
      <circle cx="120" cy="86" r="52" fill="#FFF0C7" />
      <path d="M0 120c30 0 40-34 70-34h12" fill="none" stroke="#0A6B66" strokeWidth="9" strokeLinecap="round" />
      <rect x="78" y="70" width="34" height="32" rx="9" fill="#17A398" />
      <rect x="86" y="62" width="18" height="10" rx="3" fill="#0A6B66" />
      <path d="M240 54c-30 0-40 30-70 30h-12" fill="none" stroke="#FF6B5A" strokeWidth="9" strokeLinecap="round" />
      <rect x="128" y="68" width="34" height="32" rx="9" fill="#FF8A75" />
      <path d="M128 76h-12M128 92h-12" stroke="#B4322A" strokeWidth="6" strokeLinecap="round" />
      <path d="M118 40l-8 16h10l-8 16" fill="none" stroke="#FFC531" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FFC531" />
      <path d="M200 120l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5Z" fill="#18B9A7" />
    </svg>
  );
}

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // ضغط مؤقت على قاعدة البيانات، لا عطل: نقول ذلك بوضوح ولا نعرض رمز خطأ
  const busy = isBusyDigest(error.digest);
  return (
    <section className="bg-sunny bg-dots relative overflow-hidden px-4 py-14 sm:py-20">
      <Sparkle className="animate-twinkle absolute end-[10%] top-10 size-5" />
      <Sparkle className="animate-twinkle absolute start-[8%] bottom-12 size-3.5 [animation-delay:1.2s]" color="#17A398" />
      <div className="panel panel-rainbow mx-auto max-w-xl px-5 pt-10 pb-8 text-center sm:px-10 sm:pt-12 sm:pb-10">
        <div className="mx-auto h-36 w-52 sm:h-40 sm:w-60">
          <UnpluggedArt />
        </div>
        <h1 className="mt-4 font-display text-[clamp(1.8rem,5vw,2.4rem)] leading-tight font-black text-ink" data-testid={busy ? "busy-title" : undefined}>
          {busy ? DB_BUSY_TITLE : "حدث خطأ غير متوقع"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[1.02rem] leading-8 text-ink-soft">{busy ? DB_BUSY_MESSAGE : "حاول مرة أخرى، وإذا تكرر الخطأ تواصل معنا."}</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={reset}>
            <RotateCw aria-hidden />
            إعادة المحاولة
          </Button>
          <Link prefetch={false} href="/" className="btn btn-3d btn-outline btn-lg">
            <House aria-hidden />
            الصفحة الرئيسية
          </Link>
        </div>
        <Link prefetch={false} href="/contact" className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-display text-[0.95rem] font-bold text-brand-700 hover:bg-brand-50">
          <MessagesSquare className="size-4.5" aria-hidden />
          تواصل معنا
        </Link>
        {error.digest && !busy ? (
          <p className="mt-3 text-[0.82rem] text-muted">
            رمز الخطأ للدعم:{" "}
            <span dir="ltr" className="num rounded-md bg-mist px-1.5 py-0.5 font-mono">
              {error.digest}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
