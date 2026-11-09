import type { CSSProperties } from "react";

/**
 * ألوان لوحة التحكم («الفصل المشمس» للعمل اليومي).
 * كل لون يضبط متغيرات CSS نفسها التي تستخدمها أصناف النظام (.icon-tile و .chip):
 * --a (من) --b (إلى) --d (الحافة) --soft (خلفية فاتحة) --tink (نص على الفاتح) --icon (لون الأيقونة على التدرج).
 * «teal» يتبع لون الهوية المحقون من الإعدادات (--brand) حتى يبقى تغيير الهوية ممكنًا.
 * لا تبنِ أسماء أصناف Tailwind ديناميكيًا؛ مرّر toneStyle(tone) في style.
 */
export type AdminTone = "teal" | "gold" | "coral" | "violet" | "sky" | "pink" | "green" | "slate";

type ToneDef = { a: string; b: string; d: string; soft: string; tink: string; icon: string };

export const ADMIN_TONES: Record<AdminTone, ToneDef> = {
  teal: { a: "var(--brand-hi)", b: "var(--brand)", d: "var(--brand-edge)", soft: "var(--color-brand-50)", tink: "var(--brand-deep)", icon: "#fff" },
  gold: { a: "#FFD25E", b: "#F0A500", d: "#C98500", soft: "#FFF4D6", tink: "#8A5A00", icon: "#3D2A00" },
  coral: { a: "#FFA07A", b: "#E8483F", d: "#B4322A", soft: "#FFE7DF", tink: "#9E3520", icon: "#fff" },
  violet: { a: "#B28CFF", b: "#6A3FE0", d: "#4A2FB0", soft: "#EFE9FF", tink: "#4A2FB0", icon: "#fff" },
  sky: { a: "#7CC4FF", b: "#3B6FE0", d: "#2B4FB5", soft: "#E6EEFF", tink: "#2B33B5", icon: "#fff" },
  pink: { a: "#FF85B8", b: "#C42F86", d: "#962267", soft: "#FFE6F1", tink: "#A8256F", icon: "#fff" },
  green: { a: "#34D9A0", b: "#0B8A66", d: "#076B4F", soft: "#DEF8EE", tink: "#0A6F52", icon: "#fff" },
  slate: { a: "#9FB0BA", b: "#4B5A64", d: "#36434B", soft: "#EEF1F3", tink: "#36434B", icon: "#fff" },
};

export type AdminToneStyle = CSSProperties & Record<`--${string}`, string>;

/** متغيرات اللون لعنصر (استخدمها مع ‎.icon-tile‎ أو ‎.chip‎ أو أصناف ‎[var(--a)]‎) */
export function toneStyle(tone: AdminTone = "teal"): AdminToneStyle {
  const t = ADMIN_TONES[tone] ?? ADMIN_TONES.teal;
  return { "--a": t.a, "--b": t.b, "--d": t.d, "--soft": t.soft, "--tink": t.tink, "--icon": t.icon };
}

/** لحاوية الرقم في البطاقات: المبلغ الطويل يصغر خطه حتى لا يُقص (longAmount)، والوحدة تنزل سطرًا عند الحاجة */
export const FIT_AMOUNT =
  "[overflow-wrap:anywhere] [&_.whitespace-nowrap]:whitespace-normal [&_.num[data-long=s]]:text-[0.9em] [&_.num[data-long=m]]:text-[0.8em] [&_.num[data-long=l]]:text-[0.72em]";

/** حلقة تركيز للبطاقة التي تحوي رابطًا ممتدًا (.stretched) — النظام يغطي .card-soft/.panel/article فقط */
export const STRETCHED_FOCUS =
  "has-[.stretched:focus-visible]:outline-[3px] has-[.stretched:focus-visible]:outline-offset-2 has-[.stretched:focus-visible]:outline-solid has-[.stretched:focus-visible]:outline-brand-600";
