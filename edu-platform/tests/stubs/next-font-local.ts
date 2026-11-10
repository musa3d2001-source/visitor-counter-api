/** بديل next/font/local في اختبارات Vitest: التحويل الحقيقي يتم وقت البناء، ويُفحص في tests/unit/fonts.test.ts وفي E2E */
export default function localFont() {
  return { className: "font-stub", variable: "", style: { fontFamily: "stub" } };
}
