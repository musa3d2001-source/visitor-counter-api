/**
 * مستويات MVP-A (GAME_DESIGN.md §12): ملفات JSON يولّدها scripts/game/build-levels.ts، وتُستورد ثابتةً هنا
 * فتعمل في Node والمتصفح بلا قراءة ملفات. كل تصميم يُحلَّل بمخطط zod عند التحميل، وحله المرجعي وبصمته الذهبية
 * في tests/fixtures/game-solutions/<key>.json (يتحقق منهما scripts/validate-levels.ts واختبارات الوحدة).
 * الترتيب بالصعوبة: طبقتان لكل مستوى من 1 إلى 4.
 */
import { parseLevel, type Level } from "../core/level-schema";
import palmArbour from "./palm-arbour.json";
import marketCanopy from "./market-canopy.json";
import dhowShed from "./dhow-shed.json";
import coralWall from "./coral-wall.json";
import windTower from "./wind-tower.json";
import harbourLight from "./harbour-light.json";
import lightboxCourt from "./lightbox-court.json";
import dawnHarbour from "./dawn-harbour.json";

/** تجميد عميق: التصميم بيانات ثابتة يشترك فيها العميل والخادم */
function freeze(l: Level): Level {
  for (const b of l.bodies) Object.freeze(b);
  for (const b of l.lanterns) Object.freeze(b);
  Object.freeze(l.bodies);
  Object.freeze(l.lanterns);
  return Object.freeze(l);
}

export const LEVELS: readonly Level[] = Object.freeze([palmArbour, marketCanopy, dhowShed, coralWall, windTower, harbourLight, lightboxCourt, dawnHarbour].map((d) => freeze(parseLevel(d))));

const BY_KEY = new Map(LEVELS.map((l) => [l.key, l]));

/** التصميم بمفتاحه، أو null إن لم يوجد */
export function getLevel(key: string): Level | null {
  return BY_KEY.get(key) ?? null;
}
