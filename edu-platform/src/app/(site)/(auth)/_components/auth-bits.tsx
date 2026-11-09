import Link from "next/link";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ar } from "@/lib/design";
import { cn } from "@/lib/utils";

/** فاصل «أو» بخطين ناعمين */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 font-display text-[0.85rem] font-extrabold text-muted" aria-hidden>
      <span className="h-px flex-1 bg-linear-to-l from-transparent to-line-strong" />
      {label}
      <span className="h-px flex-1 bg-linear-to-r from-transparent to-line-strong" />
    </div>
  );
}

/**
 * بطاقة الانتقال بين الدخول وإنشاء الحساب: سؤال قصير + رابط واضح بشكل زر ناعم.
 * النص داخل <p> حتى يبقى السؤال والرابط جملة واحدة لقارئ الشاشة.
 */
export function SwitchCard({ question, href, label, icon }: { question: string; href: string; label: string; icon: React.ReactNode }) {
  return (
    <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-brand-100 bg-linear-to-l from-brand-50 to-[#fff8ec] px-4 py-3 text-[0.95rem] font-bold text-ink-soft">
      <span className="inline-flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-xs [&_svg]:size-4.5" aria-hidden>
          {icon}
        </span>
        {question}
      </span>
      <Link href={href} className="btn btn-3d btn-outline btn-sm text-brand-700 max-sm:w-full">
        {label}
        <ArrowLeft aria-hidden />
      </Link>
    </p>
  );
}

/** الرقم الأبيض على الطرفين الداكنين للمرجاني والفيروزي (تباين AA)، والذهبي بحبر بني داكن */
const STEPS = [
  { t: "أدخل بريدك", tone: "from-[#e8483f] to-[#b4322a] text-white" },
  { t: "افتح الرسالة", tone: "from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]" },
  { t: "كلمة جديدة", tone: "from-[#17a398] to-[#0a5f5b] text-white" },
];

/** خطوات استعادة كلمة المرور الثلاث (توضيح بصري لما سيحدث) */
export function ResetSteps() {
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-[#fffaf1] p-2.5">
      {STEPS.map((s, i) => (
        <li key={s.t} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center">
          <span className={cn("grid size-9 place-items-center rounded-xl bg-linear-to-br font-display text-[1.05rem] font-black shadow-[inset_0_-3px_0_rgb(0_0_0/0.12)]", s.tone)} aria-hidden>
            {ar(i + 1)}
          </span>
          <span className="font-display text-[0.82rem] leading-5 font-extrabold text-ink-soft">{s.t}</span>
        </li>
      ))}
    </ol>
  );
}

/** رسم ظرف بريد مرح لحالة «أرسلنا الرابط» */
export function MailArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 130" className={className} width="100%" height="100%" aria-hidden focusable="false">
      <circle cx="80" cy="68" r="56" fill="#FFF0C7" />
      <circle cx="80" cy="68" r="40" fill="#fff" opacity=".75" />
      <path d="M20 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#FFC531" />
      <path d="M140 92l2.5 5.5 5.5 2.5-5.5 2.5-2.5 5.5-2.5-5.5-5.5-2.5 5.5-2.5Z" fill="#18B9A7" />
      <g transform="rotate(-6 80 70)">
        <rect x="36" y="42" width="88" height="60" rx="12" fill="#0A6B66" />
        <rect x="44" y="30" width="72" height="54" rx="8" fill="#fff" />
        <rect x="54" y="42" width="40" height="6" rx="3" fill="#18B9A7" opacity=".55" />
        <rect x="54" y="54" width="52" height="6" rx="3" fill="#E0D2BA" />
        <path d="M36 54l44 28 44-28v38a10 10 0 0 1-10 10H46a10 10 0 0 1-10-10Z" fill="#17A398" />
        <path d="M36 102l34-26M124 102 90 76" stroke="#0A6B66" strokeWidth="3" strokeLinecap="round" opacity=".5" />
      </g>
      <circle cx="122" cy="40" r="14" fill="#FF6B5A" />
      <path d="M116 40l4.5 4.5L129 36" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
