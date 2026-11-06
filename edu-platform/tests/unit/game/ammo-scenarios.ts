/**
 * سيناريوهات القذائف الخاصة (النيزك الثقيل والمذنّب والنبضة) على تصميم صغير ثابت: يشترك فيها اختبار الوحدة
 * وعملية Node الجديدة (ammo-child.ts)، فتُثبَّت بصماتها ذهبيًا وتُقارن بين العمليتين.
 */
import { aimAt } from "../../../src/game/core/aim-table";
import { parseLevel, type Level } from "../../../src/game/core/level-schema";
import type { Shot } from "../../../src/game/core/sim";
import { LAUNCH } from "../../../src/game/core/world";

/** عمود حجر بحري بقنديل فوقه، وجدار زجاج، وصندوق ضوء بين جناحين من الساج */
export const AMMO_LEVEL: Level = parseLevel({
  key: "ammo-scenarios",
  title: "سيناريوهات القذائف",
  version: 1,
  tier: 2,
  slots: 5,
  par: 4,
  streakReward: "heavy",
  bodies: [
    { m: "stone", x: 0, y: 60, z: 0, w: 60, h: 120, d: 60 },
    { m: "glass", x: -260, y: 45, z: 40, w: 40, h: 90, d: 120 },
    { m: "teak", x: 260, y: 50, z: -60, w: 30, h: 100, d: 30 },
    { m: "teak", x: 360, y: 50, z: -60, w: 30, h: 100, d: 30 },
    { m: "lightbox", x: 310, y: 35, z: 30, w: 70, h: 70, d: 70 },
  ],
  lanterns: [
    { x: 0, y: 150, z: 0 },
    { x: -260, y: 30, z: -60 },
    { x: 310, y: 130, z: -60 },
  ],
});

/** فهرس عمود الحجر في sim.bodies */
export const STONE_INDEX = 0;

const at = (x: number, y: number, z: number, scale = 1) => aimAt(LAUNCH, { x, y, z }, { speedScale: scale });
const stoneAim = at(0, 0.6, 0.3, 0.9);

export const SCENARIOS: Record<string, Shot[]> = {
  /** النيزك الثقيل على عمود الحجر: يكسره */
  heavyStone: [{ idx: 0, ammo: "heavy", ...stoneAim, activateAt: -1 }],
  /** الشهاب على العمود نفسه بالتصويب نفسه: لا يكسر الحجر */
  meteorStone: [{ idx: 0, ammo: "meteor", ...stoneAim, activateAt: -1 }],
  /** مذنّب نحو الزجاج يُفعَّل أثناء الطيران */
  cometSplit: [{ idx: 0, ammo: "comet", ...at(-2.6, 0.8, 0.4), activateAt: 24 }],
  /** المذنّب نفسه بلا تفعيل */
  cometWhole: [{ idx: 0, ammo: "comet", ...at(-2.6, 0.8, 0.4), activateAt: -1 }],
  /** نبضة الفجر قرب صندوق الضوء */
  pulseBurst: [{ idx: 0, ammo: "pulse", ...at(3.1, 0.9, 0.3), activateAt: 70 }],
  /** النبضة نفسها بلا تفعيل */
  pulseQuiet: [{ idx: 0, ammo: "pulse", ...at(3.1, 0.9, 0.3), activateAt: -1 }],
};
