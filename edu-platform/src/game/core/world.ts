/** ثوابت العالم ثلاثي الأبعاد (بالمتر). المحاور: x يمين، y أعلى، z نحو الكاميرا؛ الرمي نحو z السالبة */
export const DT = 1 / 60;
export const SOLVER_ITERATIONS = 4;
export const GRAVITY = -9.81;
/** الجزيرة: صندوق ثابت بنصف هذه الأبعاد، سطحه y = 0 */
export const ISLAND = { hx: 9, hy: 0.5, hz: 7 } as const;
/** فوهة المرقاب */
export const LAUNCH = { x: 0, y: 2.2, z: 12.5 } as const;
/** ما يخرج عن هذه الحدود يُزال بترتيب الفهرس (يسقط في البحر أو يطير بعيدًا) */
export const BOUNDS = { minX: -22, maxX: 22, minY: -5, minZ: -24, maxZ: 26 } as const;
/** السكون: |v|² و |ω|² لعدد متتالٍ من الخطوات، مع حد أقصى للطلقة */
export const QUIET = { v2: 0.05 * 0.05, w2: 0.1 * 0.1, steps: 30, maxStepsPerShot: 900 } as const;
/** القذيفة تنطفئ إذا تدحرجت ببطء بعد عدد خطوات، أو بلغت عمرها الأقصى */
export const PROJECTILE_LIFE = { slowV2: 1, slowAfter: 45, maxSteps: 240 } as const;
/** القنديل يتحرر إذا ابتعد هذا القدر (مربع المسافة) عن مكانه بعد الافتتاح */
export const FREE_D2 = 0.6 * 0.6;
/** أبعاد القنديل للتصادم (سم) */
export const LANTERN_SIZE = { w: 50, h: 60, d: 50 } as const;
/** حدود التصميم */
export const LEVEL_LIMITS = { maxBodies: 90, maxLanterns: 8, maxReachFromLauncher: 18 } as const;
