import { Check, Eye, Lightbulb, X } from "lucide-react";
import { Sparkle } from "@/components/art";
import { CHOICE_LETTERS } from "@/server/questions/rules";
import type { ClientQuestion } from "@/server/questions/serve";
import { cn } from "@/lib/utils";

/**
 * معاينة «كما يراه الطالب»: تُبنى فقط من ClientQuestion (المسلسل نفسه الذي يصل الطالب)،
 * فلا تحمل أي إشارة إلى الإجابة الصحيحة ولا الشرح ولا الصفحة.
 */
export function StudentPreview({ preview }: { preview: ClientQuestion | null }) {
  return (
    <section
      aria-labelledby="student-preview-h"
      className="on-dark bg-teal-night relative isolate min-w-0 overflow-hidden rounded-[1.75rem] p-4 text-white shadow-pop sm:p-5"
    >
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.16)_1.2px,transparent_1.6px)] bg-[length:20px_20px] opacity-70 [mask-image:radial-gradient(60%_70%_at_85%_10%,#000_10%,transparent_75%)]"
        aria-hidden
      />
      <span className="pointer-events-none absolute -end-14 -bottom-20 -z-10 size-48 rounded-full border-[18px] border-white/[0.06]" aria-hidden />
      <Sparkle className="pointer-events-none absolute end-5 top-4 size-4 animate-twinkle" />
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-[0.9rem] bg-linear-to-br from-[#FFD25E] to-[#F0A500] text-[#3D2A00] shadow-[inset_0_-3px_0_rgb(0_0_0/0.14)]" aria-hidden>
          <Eye className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="student-preview-h" className="font-display text-[1.2rem] leading-snug font-black text-white">
            كما يراه الطالب
          </h2>
          <p className="text-[0.8rem] leading-5 text-white/75">
            {preview?.type === "true_false" ? "بلا إشارة للإجابة، والترتيب ثابت: صح ثم خطأ" : "بلا إشارة للإجابة، ويُخلط ترتيب الخيارات لكل طالب"}
          </p>
        </div>
      </div>

      {preview ? (
        <div dir={preview.lang === "en" ? "ltr" : "rtl"} lang={preview.lang}>
          <p className="rounded-[1.25rem] bg-white px-4 py-3.5 font-display text-[1.05rem] leading-8 font-extrabold break-words whitespace-pre-line text-ink shadow-[0_5px_0_rgb(0_0_0/0.18)]">
            {preview.stem}
          </p>
          {preview.type === "true_false" ? (
            <ul className="mt-4 grid grid-cols-2 gap-2.5">
              {preview.choices.map((c, i) => (
                <li
                  key={c.id}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-white/25 bg-white/10 px-3 font-display text-[1rem] font-black text-white shadow-[0_4px_0_rgb(0_0_0/0.22)]"
                >
                  {i === 0 ? <Check className="size-5 text-[#9BEBD8]" aria-hidden /> : <X className="size-5 text-[#FFB4A3]" aria-hidden />}
                  <span className="break-words">{c.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ol className="mt-4 grid gap-2.5">
              {preview.choices.map((c, i) => (
                <li
                  key={c.id}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border-2 border-white/25 bg-white/10 px-2.5 py-2 text-white shadow-[0_4px_0_rgb(0_0_0/0.22)]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[0.7rem] bg-white font-display text-[0.95rem] font-black text-brand-800" aria-hidden>
                    {CHOICE_LETTERS[i]}
                  </span>
                  <span className="sr-only">{`الخيار ${CHOICE_LETTERS[i]}: `}</span>
                  <span className="min-w-0 flex-1 font-display text-[0.98rem] leading-7 font-bold break-words">{c.text}</span>
                </li>
              ))}
            </ol>
          )}
          {preview.hint ? (
            <details className="group/hint mt-4 rounded-2xl bg-black/20 ring-1 ring-white/15">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3.5 font-display text-[0.9rem] font-extrabold text-[#FFD25E] [&::-webkit-details-marker]:hidden">
                <Lightbulb className="size-4" aria-hidden /> تلميح
              </summary>
              <p className="px-3.5 pb-3 text-[0.92rem] leading-7 break-words text-white/90">{preview.hint}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p className={cn("rounded-2xl bg-black/20 px-4 py-3 text-[0.92rem] leading-7 text-white/85")}>تعذّرت المعاينة. احفظ السؤال بخيارات مكتملة ثم أعد فتح الصفحة.</p>
      )}
    </section>
  );
}
