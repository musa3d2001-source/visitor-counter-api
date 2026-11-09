import { Sparkle } from "@/components/art";
import { PERK_ICONS } from "@/components/site/auth-card";
import type { authPerks } from "@/lib/site-truth";
import { cn } from "@/lib/utils";

/**
 * على الجوال لا يظهر الجانب المرسوم في AuthCard، فنعرض المزايا نفسها في شريط فيروزي صغير.
 * المزايا تأتي من الصفحة حتى لا يحتاج المكوّن إلى قاعدة البيانات، وauth-bits تستوردها نماذج عميل فلا مكان له فيها.
 */
export function MobilePerks({ perks, className }: { perks: ReturnType<typeof authPerks>; className?: string }) {
  return (
    <div className={cn("bg-teal-night on-dark relative isolate mt-7 overflow-hidden rounded-[1.6rem] p-4 shadow-pop lg:hidden", className)}>
      <span className="absolute -bottom-9 -left-9 -z-10 size-20 rounded-full bg-[radial-gradient(circle_at_40%_40%,#fff0bf,#ffc531_60%)] shadow-[0_0_0_14px_rgb(255_197_49/0.12),0_0_0_30px_rgb(255_197_49/0.06)]" aria-hidden />
      <Sparkle className="absolute top-2.5 left-3 size-3.5" color="#FFE29A" />
      <ul className="grid gap-2">
        {perks.map(({ key, text }) => {
          const Icon = PERK_ICONS[key];
          return (
            <li key={key} className="flex items-center gap-3 text-[0.9rem] leading-6 text-white/92">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#ffd25e] to-[#eb9b00] text-[#3d2a00]">
                <Icon className="size-4" aria-hidden />
              </span>
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
