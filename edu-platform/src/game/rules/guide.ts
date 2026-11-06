/**
 * طول دليل التصويب بالنقاط (GAME_DESIGN.md §10): أساس حسب طبقة التصميم، يُضرب في معامل العمر،
 * ويزيد ×1.5 بعد 3 إخفاقات متتالية في المستوى، ثم يُقرَّب ويُحصر في 8..64 (أقصى ما يرسمه المشهد).
 * المعاملات (1.5 و0.75) ثنائية الكسر، فالضرب دقيق ولا يختلف بين المحركات.
 */
import { ageProfile } from "./age-profile";

/** الأساس للطبقات 1..4 */
const TIER_BASE = [30, 24, 18, 14] as const;
const FAIL_STREAK_LONGER = 3;
const FAIL_FACTOR = 1.5;
const MIN_POINTS = 8;
const MAX_POINTS = 64;

export function guidePoints(tier: number, gradeLevel: number, failStreak: number): number {
  const t = Number.isFinite(tier) ? Math.min(4, Math.max(1, Math.trunc(tier))) : 1;
  let points = TIER_BASE[t - 1] * ageProfile(gradeLevel).guideFactor;
  if (failStreak >= FAIL_STREAK_LONGER) points *= FAIL_FACTOR;
  return Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(points)));
}
