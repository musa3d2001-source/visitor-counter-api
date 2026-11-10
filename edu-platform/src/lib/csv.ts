/**
 * خانات CSV آمنة للفتح في جداول البيانات. Excel وGoogle Sheets ينفذان أي خانة تبدأ بصيغة، حتى لو جاءت من اسم كتبه طالب.
 * بداية الخانة تُفحص بعد تجاوز المسافات وعلامات الاتجاه غير المرئية، وهي شائعة في النصوص العربية، وتشمل الأشكال العريضة لهذه الرموز.
 * الخانة الخطرة تأخذ علامة ' في أولها فتصبح نصًا.
 */
const FORMULA_START = /^[\s​-‏‪-‮⁠-⁩﻿]*[=+\-@＝＋－＠]|^[\t\r]/;

export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}
