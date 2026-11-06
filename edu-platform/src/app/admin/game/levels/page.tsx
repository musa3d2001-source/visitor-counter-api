import { Gamepad2 } from "lucide-react";
import { requireOwnerPage } from "@/server/auth/permissions";
import { AdminPageHeader, Panel } from "@/components/admin/page-header";
import { toneStyle, type AdminTone } from "@/components/admin/tones";
import { ar, count, type CountWord } from "@/lib/design";
import { AMMO } from "@/game/core/ammo";
import { LEVELS } from "@/game/levels";
import type { LevelSummary } from "./levels-runner";
import { LevelsClient, PlayLevelButton } from "./levels-client";

export const metadata = { title: "معاينة تصاميم اللعبة" };


const BODY: CountWord = { one: "جسم", two: "جسمان", plural: "أجسام", acc: "جسمًا" };
const LANTERN: CountWord = { one: "قنديل", two: "قنديلان", plural: "قناديل", acc: "قنديلًا" };
const SLOT: CountWord = { one: "خانة", two: "خانتان", plural: "خانات", acc: "خانة", oneSuffix: "واحدة" };
/** لون بطاقة كل طبقة صعوبة (أسماء أصناف ثابتة؛ اللون عبر متغيرات CSS) */
const TIER_TONE: Record<number, AdminTone> = { 1: "green", 2: "sky", 3: "violet", 4: "coral" };

/**
 * معاينة تصاميم MVP-A للمالك فقط: يلعب كل تصميم بملء الشاشة بالمحرك الحقيقي (بلا أسئلة بعد) ليحكم على الإحساس.
 * الصفحة تسرد التصاميم على الخادم، والمشغّل جزيرة عميل ssr:false تحمّل three و Rapier بـ import() عند الضغط.
 * لا تكتب شيئًا في قاعدة البيانات.
 */
export default async function GameLevelsPage() {
  await requireOwnerPage();
  const levels: LevelSummary[] = LEVELS.map((l) => ({
    key: l.key,
    title: l.title,
    tier: l.tier,
    slots: l.slots,
    par: l.par,
    bodies: l.bodies.length,
    lanterns: l.lanterns.length,
    reward: AMMO[l.streakReward].label,
  }));
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="معاينة تصاميم اللعبة"
        description={`${count(levels.length, { one: "تصميم", two: "تصميمان", plural: "تصاميم", acc: "تصميمًا" })} بالمحرك الحقيقي: الكاميرا خلف المرقاب، والليل يتدرج إلى الشروق كلما تحرر قنديل. افتح من جوالك وجرّب الرمي.`}
        icon={<Gamepad2 />}
        tone="violet"
      />
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {levels.map((l) => (
          <li key={l.key} className="tile-3d flex flex-col gap-3 p-4" style={toneStyle(TIER_TONE[l.tier] ?? "teal")}>
            <div className="flex items-center gap-3">
              <span className="num-tile" aria-hidden>
                {ar(l.tier)}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-[1.1rem] leading-snug font-black text-ink">{l.title}</h2>
                <p className="chip mt-1">الطبقة {ar(l.tier)}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.88rem] leading-6">
              <dt className="text-muted">الخانات</dt>
              <dd className="font-bold text-ink">{count(l.slots, SLOT)}</dd>
              <dt className="text-muted">الحد للمهارة</dt>
              <dd className="font-bold text-ink">{ar(l.par)}</dd>
              <dt className="text-muted">البنية</dt>
              <dd className="font-bold text-ink">{count(l.bodies, BODY)}</dd>
              <dt className="text-muted">القناديل</dt>
              <dd className="font-bold text-ink">{count(l.lanterns, LANTERN)}</dd>
              <dt className="text-muted">المكافأة</dt>
              <dd className="font-bold text-ink">{l.reward}</dd>
            </dl>
            <p dir="ltr" className="text-end font-mono text-[0.75rem] text-muted">
              {l.key}
            </p>
            <div className="mt-auto">
              <PlayLevelButton levelKey={l.key} title={l.title} />
            </div>
          </li>
        ))}
      </ul>
      <Panel>
        <LevelsClient levels={levels} />
      </Panel>
    </div>
  );
}
