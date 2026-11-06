/**
 * ملاءمة العمر (GAME_DESIGN.md §10، ARCHITECTURE.md §5): جدول نطاقات من grades.level وحده،
 * فلا يقرأ أسماء الصفوف ولا slug المرحلة، ونشر أي صف في الكتالوج يظهره تلقائيًا.
 */

export type AgeProfile = { fontScale: number; minChoices: number; maxChoices: number; guideFactor: number; specialsAllowed: boolean };

/** 1–5: خط أكبر، وخياران أو ثلاثة، ودليل تصويب طويل، وبلا قذائف خاصة */
const PRIMARY: AgeProfile = { fontScale: 1.2, minChoices: 2, maxChoices: 3, guideFactor: 1.5, specialsAllowed: false };
/** 6–9: الإعداد العادي */
const MIDDLE: AgeProfile = { fontScale: 1, minChoices: 2, maxChoices: 4, guideFactor: 1, specialsAllowed: true };
/** 10–12: دليل تصويب قصير */
const SECONDARY: AgeProfile = { fontScale: 1, minChoices: 2, maxChoices: 4, guideFactor: 0.75, specialsAllowed: true };

/** ما خرج عن 1..12 يُحصر في أقرب نطاق؛ والقيمة غير العددية تأخذ الأصغر (الأكثر رفقًا) */
export function ageProfile(gradeLevel: number): AgeProfile {
  if (!Number.isFinite(gradeLevel) || gradeLevel <= 5) return { ...PRIMARY };
  if (gradeLevel <= 9) return { ...MIDDLE };
  return { ...SECONDARY };
}
