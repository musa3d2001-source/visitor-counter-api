import { LibraryBig, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { LogoMark, Sparkle, SubjectArt } from "@/components/art";
import { subjectVars } from "@/lib/design";
import type { authPerks, AuthPerkKey } from "@/lib/site-truth";

export const PERK_ICONS: Record<AuthPerkKey, typeof LibraryBig> = { library: LibraryBig, resume: MonitorSmartphone, pay: ShieldCheck };

/**
 * غلاف صفحات الدخول: خلفية مشمسة، لوح أبيض للنموذج، وعلى الحاسوب جانب فيروزي مرسوم
 * (مروحة أغلفة مواد + مزايا حقيقية للمنصة).
 */
export function AuthCard({ title, subtitle, perks, children }: { title: string; subtitle?: string; perks: ReturnType<typeof authPerks>; children: React.ReactNode }) {
  return (
    <div className="bg-sunny bg-dots relative">
      <span className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-linear-to-b from-transparent to-canvas" aria-hidden />
      <div className="mx-auto grid w-full max-w-6xl items-stretch gap-6 px-4 py-8 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10 lg:py-16">
        {/* النموذج */}
        <div className="panel panel-rainbow mx-auto w-full max-w-lg self-center px-5 pt-9 pb-7 sm:px-9 sm:pt-11 sm:pb-9 lg:max-w-none">
          <div className="mb-7 flex items-start gap-3.5">
            <LogoMark size={48} className="shrink-0 drop-shadow-[0_8px_14px_rgb(6_80_75/0.28)]" />
            <div className="min-w-0">
              <h1 className="font-display text-[clamp(1.7rem,5vw,2.25rem)] leading-tight font-black text-ink">{title}</h1>
              {subtitle ? <p className="mt-1.5 text-[1rem] leading-7 text-ink-soft">{subtitle}</p> : null}
            </div>
          </div>
          {children}
        </div>

        {/* الجانب المرسوم (الحاسوب فقط) */}
        <aside
          className="bg-teal-night on-dark relative isolate hidden min-h-[34rem] flex-col justify-between overflow-hidden rounded-[2.25rem] p-10 shadow-pop lg:flex"
        >
          <span className="absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.12)_1.3px,transparent_1.6px)] bg-[length:22px_22px]" />
          <span className="absolute -end-16 -top-20 -z-10 size-64 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff0bf,#ffc531_60%)] shadow-[0_0_0_36px_rgb(255_197_49/0.16),0_0_0_76px_rgb(255_197_49/0.08)]" />
          <Sparkle className="animate-twinkle absolute start-[46%] top-10 size-6" color="#FFE29A" />
          <Sparkle className="animate-twinkle absolute start-10 bottom-40 size-4 [animation-delay:1.2s]" color="#fff" />

          <div className="relative mx-auto mt-6 h-64 w-full max-w-sm" aria-hidden>
            {(
              [
                { slug: "science", cls: "start-0 top-8 -rotate-[10deg]" },
                { slug: "english", cls: "end-0 top-4 rotate-[9deg]" },
                { slug: "math", cls: "inset-x-0 mx-auto top-0 -rotate-[1deg] z-10" },
              ] as const
            ).map((c) => (
              <div key={c.slug} className={`absolute w-44 rounded-[1.4rem] bg-white p-2 shadow-[0_30px_50px_-24px_rgb(0_0_0/0.6)] ${c.cls}`} style={subjectVars(c.slug)}>
                <div className="poster aspect-[4/4.2] rounded-[1.05rem]">
                  <div className="absolute inset-[14%]">
                    <SubjectArt slug={c.slug} />
                  </div>
                </div>
                <div className="flex items-center gap-2 px-1.5 pt-2 pb-1">
                  <span className="h-2 w-16 rounded-full bg-[var(--soft)]" />
                  <span className="ms-auto h-2 w-8 rounded-full bg-[var(--a)]" />
                </div>
              </div>
            ))}
          </div>

          <ul className="mt-8 grid gap-3">
            {perks.map(({ key, text }) => {
              const Icon = PERK_ICONS[key];
              return (
                <li key={key} className="flex items-center gap-3 rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[0.98rem] leading-7 text-white/90">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  {text}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}
