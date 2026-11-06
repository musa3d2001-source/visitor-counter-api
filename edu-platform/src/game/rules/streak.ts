/**
 * القذيفة الخاصة (GAME_DESIGN.md §6.4): ثلاث إجابات صحيحة متتالية في أسئلة الخانات، أو تحدٍّ صحيح،
 * تمنح قذيفة من streakReward للتصميم، واثنتان مخزّنتان على الأكثر (الزائدة لا تُمنح).
 * العدّاد يبدأ من جديد بعد المنح (ولو ضاعت المنحة لامتلاء المخزن) أو بعد خطأ.
 * دوال نقية: لا تغيّر الحالة الواردة، وتعيد حالة جديدة.
 */
import type { SpecialAmmo } from "../core/ammo";

export const STREAK_FOR_SPECIAL = 3;
export const MAX_STORED_SPECIALS = 2;

export type StreakState = { streak: number; stored: SpecialAmmo[] };

export type StreakStep = { state: StreakState; granted: SpecialAmmo | null };

export function initialStreak(): StreakState {
  return { streak: 0, stored: [] };
}

/** يمنح إن سُمح بالخاصة وفي المخزن مكان، وإلا تضيع المنحة */
function grant(stored: readonly SpecialAmmo[], reward: SpecialAmmo, allowSpecials: boolean): { stored: SpecialAmmo[]; granted: SpecialAmmo | null } {
  if (allowSpecials && stored.length < MAX_STORED_SPECIALS) return { stored: [...stored, reward], granted: reward };
  return { stored: [...stored], granted: null };
}

/**
 * إجابة سؤال خانة: الخطأ يصفّر العدّاد، والصحيحة تزيده، وعند بلوغه 3 تُمنح قذيفة ويعود إلى الصفر.
 * allowSpecials = false (ملف العمر 1–5) لا يمنح شيئًا.
 */
export function onSlotAnswer(s: StreakState, correct: boolean, reward: SpecialAmmo, allowSpecials = true): StreakStep {
  if (!correct) return { state: { streak: 0, stored: [...s.stored] }, granted: null };
  const streak = s.streak + 1;
  if (streak < STREAK_FOR_SPECIAL) return { state: { streak, stored: [...s.stored] }, granted: null };
  const g = grant(s.stored, reward, allowSpecials);
  return { state: { streak: 0, stored: g.stored }, granted: g.granted };
}

/**
 * إجابة التحدي (يستبدل سؤال خانة، مرة في الجولة): الصحيحة تمنح قذيفة مستقلة عن العدّاد ولا تغيّره،
 * والخاطئة تصفّر العدّاد.
 */
export function onChallengeAnswer(s: StreakState, correct: boolean, reward: SpecialAmmo, allowSpecials = true): StreakStep {
  if (!correct) return { state: { streak: 0, stored: [...s.stored] }, granted: null };
  const g = grant(s.stored, reward, allowSpecials);
  return { state: { streak: s.streak, stored: g.stored }, granted: g.granted };
}

/** استعمال قذيفة مخزّنة (تستبدل نوع رمية الخانة ولا تضيف رمية)؛ null إن لم تكن مخزّنة */
export function consumeSpecial(s: StreakState, ammo: SpecialAmmo): StreakState | null {
  const at = s.stored.indexOf(ammo);
  if (at < 0) return null;
  return { streak: s.streak, stored: [...s.stored.slice(0, at), ...s.stored.slice(at + 1)] };
}
