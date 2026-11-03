import { FileText, Play } from "lucide-react";
import { BundleStack, Sparkle, SubjectArt, SubjectIcon } from "@/components/art";
import { SUBJECT_TONES, ar, gradeClass, toneClass } from "@/lib/design";
import { cn } from "@/lib/utils";

/**
 * رسومات زخرفية لشرائط صفحات المحتوى (aria-hidden، تملأ حاويتها h-40 w-60).
 * مبنية من أصناف النظام نفسها (.poster ‎.num-tile‎ ‎.tone-*‎ ‎.grade-*‎) حتى تطابق بطاقات الموقع.
 */

function MiniPoster({ slug, className, video = true }: { slug: string; className?: string; video?: boolean }) {
  return (
    <span className={cn("poster absolute block aspect-[4/5] w-24 rounded-[1.1rem] border-[3px] border-white shadow-[0_14px_26px_-14px_rgb(23_32_38/0.55)]", toneClass(slug), className)}>
      <span className="absolute inset-x-2 top-3 bottom-6 block">
        <SubjectArt slug={slug} />
      </span>
      {video ? (
        <span className="absolute start-2 bottom-2 grid size-6 place-items-center rounded-full bg-white text-[var(--b)] shadow-xs">
          <Play className="size-3" fill="currentColor" />
        </span>
      ) : null}
    </span>
  );
}

/** مروحة أغلفة مواد ملونة + ورقة مذكرة: للمحتوى والمنتجات */
export function PostersArt() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-6 top-4 bottom-2 rounded-full bg-[#FFC531]/20 blur-xl" />
      <MiniPoster slug="science" className="end-2 top-6 rotate-[10deg]" />
      <MiniPoster slug="english" className="start-6 top-7 -rotate-[11deg]" />
      <MiniPoster slug="math" className="start-[4.6rem] top-1 z-10 -rotate-2" />
      <span className="absolute start-0 bottom-1 z-20 flex w-[4.5rem] rotate-[-8deg] flex-col gap-1 rounded-xl border-2 border-white bg-white p-1.5 shadow-[0_12px_20px_-12px_rgb(23_32_38/0.5)]">
        <span
          className={cn("flex h-5 items-center justify-center rounded-md text-white", toneClass("arabic"))}
          style={{ background: `linear-gradient(135deg, ${SUBJECT_TONES.arabic.from}, ${SUBJECT_TONES.arabic.to})` }}
        >
          <FileText className="size-3" />
        </span>
        <span className="h-1.5 rounded-full bg-[#FFE0CF]" />
        <span className="h-1.5 w-3/4 rounded-full bg-[#FFE0CF]" />
        <span className="h-1.5 w-1/2 rounded-full bg-[#FFE0CF]" />
      </span>
      <Sparkle className="absolute end-1 top-0 size-5 animate-twinkle" />
      <Sparkle className="absolute start-2 top-2 size-3.5 animate-twinkle [animation-delay:1s]" color="#17A398" />
    </div>
  );
}

/** أربعة مربعات أرقام الصفوف بألوانها: للمراحل والمواد */
export function GradesArt({ levels = [6, 7, 8, 9] }: { levels?: number[] }) {
  const pos = ["end-3 top-3 rotate-[8deg]", "end-[6.6rem] top-0 -rotate-[6deg]", "end-6 bottom-1 -rotate-[4deg]", "end-[7.4rem] bottom-3 rotate-[7deg]"];
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-8 inset-y-4 rounded-full bg-[var(--a)]/25 blur-xl" />
      {levels.slice(0, 4).map((l, i) => (
        <span
          key={l}
          className={cn("num-tile absolute size-[4.4rem] rounded-[1.3rem] border-[3px] border-white text-[2.3rem] shadow-[0_6px_0_var(--d),0_18px_26px_-14px_var(--d)]", gradeClass(l), pos[i])}
        >
          {ar(l)}
        </span>
      ))}
      <span className="absolute start-1 top-6 grid size-11 place-items-center rounded-2xl border-2 border-white bg-white text-[#0B8A66] shadow-card">
        <SubjectIcon slug="science" size={22} />
      </span>
      <span className="absolute start-6 bottom-4 grid size-10 place-items-center rounded-2xl border-2 border-white bg-white text-[#3B3FD8] shadow-card">
        <SubjectIcon slug="math" size={20} />
      </span>
      <Sparkle className="absolute start-[4.2rem] top-1 size-5 animate-twinkle" />
    </div>
  );
}

/** أوراق باقة مروحية بألوان المواد + عملة ذهبية: للباقات */
export function BundleArt() {
  const colors = ["#FF6B5A", "#FFC531", "#18B9A7", "#4D8DFF", "#9B5CF6"];
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-6 inset-y-3 rounded-full bg-[var(--a)]/25 blur-xl" />
      <span className="absolute inset-0 drop-shadow-[0_14px_16px_rgb(23_32_38/0.25)]">
        <BundleStack colors={colors} />
      </span>
      <span className="absolute start-3 top-4 grid size-14 rotate-[-10deg] place-items-center rounded-full border-[3px] border-dashed border-white/80 bg-linear-to-br from-[#FFE08A] to-[#F0A500] shadow-[0_5px_0_#C98500]">
        <Sparkle className="size-6" color="#fff" />
      </span>
      <Sparkle className="absolute end-3 top-1 size-5 animate-twinkle" />
    </div>
  );
}

/** تذكرتا خصم مثقوبتان: للكوبونات (بلا أرقام مختلقة: رمز ٪ فقط) */
export function CouponArt({ code }: { code?: string }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-6 inset-y-4 rounded-full bg-[var(--a)]/25 blur-xl" />
      <Ticket className="end-2 top-3 rotate-[9deg] from-[#B28CFF] to-[#6A3FE0]" />
      <Ticket className="start-2 bottom-3 z-10 -rotate-[7deg] from-[#FFA07A] to-[#E8483F]" code={code} />
      <Sparkle className="absolute start-[46%] top-0 size-5 animate-twinkle" />
    </div>
  );
}

function Ticket({ className, code }: { className?: string; code?: string }) {
  return (
    <span
      className={cn(
        "absolute flex h-[4.6rem] w-44 items-stretch overflow-hidden rounded-2xl bg-linear-to-br text-white shadow-[0_14px_24px_-12px_rgb(23_32_38/0.5)]",
        "[mask:radial-gradient(circle_at_calc(100%-3.4rem)_0,#0000_0.55rem,#000_0.6rem)_top/100%_51%_no-repeat,radial-gradient(circle_at_calc(100%-3.4rem)_100%,#0000_0.55rem,#000_0.6rem)_bottom/100%_51%_no-repeat]",
        className,
      )}
    >
      <span className="grid flex-1 place-items-center px-2">
        {code ? (
          <span className="truncate font-display text-[0.95rem] font-black tracking-wider" dir="ltr">
            {code}
          </span>
        ) : (
          <span className="flex w-full flex-col gap-1.5 px-2">
            <span className="h-2 w-4/5 rounded-full bg-white/80" />
            <span className="h-2 w-1/2 rounded-full bg-white/50" />
          </span>
        )}
      </span>
      <span className="grid w-[3.4rem] place-items-center border-s-2 border-dashed border-white/60 font-display text-[1.7rem] font-black">٪</span>
    </span>
  );
}

/** لوح تحرير: غلاف بلون المادة + خطوات مرقمة: لإضافة منتج */
export function EditorArt({ slug = "math" }: { slug?: string }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <span className="absolute inset-x-6 inset-y-3 rounded-full bg-[#FFC531]/25 blur-xl" />
      <span className="absolute end-2 top-2 flex w-36 rotate-[5deg] flex-col gap-2 rounded-[1.2rem] border-2 border-white bg-white p-3 shadow-[0_16px_28px_-16px_rgb(23_32_38/0.55)]">
        {["#18B9A7", "#FFC531", "#FF6B5A"].map((c, i) => (
          <span key={c} className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-lg font-display text-[0.8rem] font-black text-white" style={{ background: c }}>
              {ar(i + 1)}
            </span>
            <span className="h-2 flex-1 rounded-full bg-[#F1E7D6]" />
          </span>
        ))}
      </span>
      <MiniPoster slug={slug} className="start-3 top-5 z-10 -rotate-[9deg]" />
      <Sparkle className="absolute start-1 top-0 size-5 animate-twinkle" />
    </div>
  );
}
