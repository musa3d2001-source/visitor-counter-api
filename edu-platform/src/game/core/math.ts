/**
 * رياضيات حتمية: جيب وتمام متعددا حدود بدل Math.sin/cos (متطابقان بتًا في V8 و JavaScriptCore).
 * القائمة البيضاء في core/ و rules/ و session/: abs min max floor ceil round trunc sign sqrt imul fround.
 */
export const PI = 3.141592653589793;
export const DEG = PI / 180;

/** جيب الزاوية بسلسلة تايلور حتى الحد الحادي عشر (خطأ < 1e-7 على [-1.1, 1.1]) */
export function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - x2 / 110)))));
}

export function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 - (x2 / 2) * (1 - (x2 / 12) * (1 - (x2 / 30) * (1 - (x2 / 56) * (1 - (x2 / 90) * (1 - x2 / 132)))));
}

/** عدد صحيح محصور في [0, max] */
export function clampStep(v: number, max: number): number {
  if (!(v > 0)) return 0;
  return v > max ? max : Math.trunc(v);
}
