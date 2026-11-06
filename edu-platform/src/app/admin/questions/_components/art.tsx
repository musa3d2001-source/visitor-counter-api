import { Check } from "lucide-react";
import { Sparkle } from "@/components/art";
import { CHOICE_LETTERS } from "@/server/questions/rules";
import { cn } from "@/lib/utils";

/**
 * رسم شريط بنك الأسئلة (زخرفي، aria-hidden، يملأ حاوية CatalogBand h-40 w-60):
 * بطاقة سؤال بيضاء بخياراتها أ ب ج د، ومربع «؟» ذهبي، وشارة إجابة صحيحة خضراء.
 */
export function QuestionsArt() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-6 inset-y-3 rounded-full bg-[#B28CFF]/25 blur-xl" />
      <span className="absolute end-2 top-1 flex w-40 rotate-[4deg] flex-col gap-1.5 rounded-[1.2rem] border-2 border-white bg-white p-2.5 shadow-[0_16px_28px_-16px_rgb(23_32_38/0.55)]">
        <span className="flex items-center gap-1.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-linear-to-br from-[#B28CFF] to-[#6A3FE0] font-display text-[0.8rem] font-black text-white">؟</span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 rounded-full bg-[#E4DAFF]" />
            <span className="h-1.5 w-2/3 rounded-full bg-[#E4DAFF]" />
          </span>
        </span>
        {CHOICE_LETTERS.map((l, i) => (
          <span key={l} className={cn("flex items-center gap-1.5 rounded-lg px-1 py-0.5", i === 1 ? "bg-[#DEF8EE]" : "bg-[#F7F4FF]")}>
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-md font-display text-[0.68rem] font-black",
                i === 1 ? "bg-[#0B8A66] text-white" : "bg-white text-[#4A2FB0] shadow-[0_1px_0_#E4DAFF]",
              )}
            >
              {l}
            </span>
            <span className={cn("h-1.5 flex-1 rounded-full", i === 1 ? "bg-[#9BE6C9]" : "bg-[#E9E2FF]")} />
          </span>
        ))}
      </span>
      <span className="absolute start-3 top-6 z-10 grid size-16 -rotate-[10deg] place-items-center rounded-[1.2rem] border-[3px] border-white bg-linear-to-br from-[#FFD25E] to-[#F0A500] font-display text-[2.2rem] leading-none font-black text-[#3D2A00] shadow-[0_5px_0_#C98500,0_16px_24px_-12px_#C98500]">
        ؟
      </span>
      <span className="absolute start-14 bottom-2 z-10 grid size-11 rotate-[8deg] place-items-center rounded-full border-[3px] border-white bg-linear-to-br from-[#34D9A0] to-[#0B8A66] text-white shadow-[0_4px_0_#076B4F,0_12px_20px_-10px_#076B4F]">
        <Check className="size-5" strokeWidth={3} />
      </span>
      <Sparkle className="absolute start-1 top-0 size-5 animate-twinkle" />
      <Sparkle className="absolute end-0 bottom-2 size-3.5 animate-twinkle [animation-delay:1.1s]" color="#9B5CF6" />
    </div>
  );
}
