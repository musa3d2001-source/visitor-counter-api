"use client";

import { useState } from "react";
import { Check, Copy, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * رموز الاسترداد بعد توليدها: تعيش في حالة React فقط، ولا تُحفظ في الرابط ولا في التخزين المحلي.
 * لا يرجع إليها المالك بعد مغادرة هذه الشاشة، فالخادم لا يملك إلا تجزئتها.
 */
export function RecoveryCodesPanel({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4" role="status">
      <div className="overflow-hidden rounded-[1.4rem] border-2 border-dashed border-[#F0C766] bg-[linear-gradient(160deg,#fffaf0,#fff1cf)] p-3.5 sm:p-5">
        <p className="mb-3 flex items-center gap-2 font-display text-[1rem] font-black text-[#6e4700]">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#FFD25E] to-[#EB9B00] text-[#3D2A00] shadow-[inset_0_-2px_0_rgb(0_0_0/0.14)]">
            <KeyRound className="size-4" aria-hidden />
          </span>
          رموز الاسترداد
        </p>
        <ul className="grid gap-2 sm:grid-cols-2" dir="ltr" data-testid="recovery-codes">
          {codes.map((code) => (
            <li key={code} className="rounded-xl bg-white px-2 py-2.5 text-center font-mono text-[0.98rem] font-bold tracking-wide text-ink shadow-xs ring-1 ring-[#F0C766]/60">
              {code}
            </li>
          ))}
        </ul>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={copied ? "soft" : "outline"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(codes.join("\n"));
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "تم النسخ" : "نسخ الكل"}
          </Button>
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[0.82rem] leading-6 text-[#6e4700]">
            <EyeOff className="size-3.5 shrink-0" aria-hidden />
            تظهر مرة واحدة فقط. احفظها في مكان آمن خارج جوالك.
          </p>
        </div>
      </div>
      <p className="text-[0.92rem] leading-7 text-ink-soft">كل رمز يعمل مرة واحدة، بدل الرمز من التطبيق إن ضاع جوالك.</p>
      <Button type="button" size="xl" className="w-full" onClick={onDone} data-testid="recovery-codes-done">
        {doneLabel}
      </Button>
    </div>
  );
}
