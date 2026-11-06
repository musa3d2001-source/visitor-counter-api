// [تجربة المرحلة 0] خطاف تحليل لـ Node فقط: حزمة @dimforge/rapier2d-deterministic مكتوبة لهدف "bundler"
// (استيرادات بلا امتداد + import لملف .wasm)، فلا تُحمَّل في Node الخام. هذا الخطاف يضيف ".js"
// للاستيرادات النسبية داخلها، ويُستخدم مع --experimental-wasm-modules. لا يلزم داخل Next (المجمّع يتولاه).
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && context.parentURL && context.parentURL.includes("/@dimforge/rapier2d-deterministic/") && !/\.(m?js|wasm|json)$/.test(specifier)) {
    try {
      return await next(specifier + ".js", context);
    } catch {
      return next(specifier + "/index.js", context);
    }
  }
  return next(specifier, context);
}
