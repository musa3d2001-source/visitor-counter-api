/**
 * ثلاثة اتجاهات فنية للعبة «شُهُب فرقد» (المرحلة 0، مختبر التطوير فقط).
 * كلها ليلية كحلية فيروزية ذهبية على ساحل الكويت، وتختلف في لغة الرسم وطريقة الواجهة:
 *  a «فانوس الخليج»   كرتون ثلاثي الأبعاد بحدود داكنة سميكة، وواجهة «الفصل المشمس» الكريمية بأزرار ثلاثية الأبعاد.
 *  b «ورق الكوكبة»    ديوراما ورقية مسطحة بلا حدود، وطبقات تلال مقصوصة، وبطاقات ملوّنة مائلة كالملصقات.
 *  c «توهّج المرصد»   ألوان مشعّة وحواف فيروزية متوهجة، وواجهة زجاجية بحواف ذهبية كألعاب الأركيد.
 */
import { SPIKE_STYLE, type SceneStyle } from "@/game/spike/style";

export type DirKey = "a" | "b" | "c";

export const DIRECTIONS: Record<DirKey, { name: string; tagline: string; style: SceneStyle }> = {
  a: {
    name: "فانوس الخليج",
    tagline: "كرتون ثلاثي الأبعاد بحدود سميكة، وواجهة كريمية بأزرار المنصة",
    style: {
      ...SPIKE_STYLE,
      key: "a",
      mats: { frond: "#e8c25e", teak: "#b06a3b", stone: "#9db4bf", glass: "#5fe0ee", cloud: "#f6f8ff", lightbox: "#ffd23f", lantern: "#ffb43b" },
      projectile: "#fff0b8",
      ground: "#0f2a4d",
      groundTop: "#f0d199",
      sea: null,
      outline: { color: "#08122b", scale: 1.09 },
      toonSteps: 3,
      lanternGlow: "#ffcf5c",
      hemi: ["#b9dcff", "#22355e", 1.55],
      moon: ["#fff3d6", 2.4],
      stars: 0,
      parallax: null,
      depth: 1.2,
    },
  },
  b: {
    name: "ورق الكوكبة",
    tagline: "ديوراما ورقية مقصوصة بطبقات ملوّنة، وبطاقات مائلة كالملصقات",
    style: {
      ...SPIKE_STYLE,
      key: "b",
      mats: { frond: "#ffd166", teak: "#ef8354", stone: "#8ecae6", glass: "#70e4d6", cloud: "#fffaf0", lightbox: "#ffe066", lantern: "#ff9f1c" },
      projectile: "#fff3c4",
      ground: "#2b2d6e",
      groundTop: "#ffe3a3",
      sea: null,
      outline: null,
      toonSteps: 2,
      lanternGlow: "#ffd27a",
      hemi: ["#ffe9d1", "#4a3f8f", 1.9],
      moon: ["#ffffff", 1.6],
      stars: 0,
      parallax: null,
      depth: 0.7,
    },
  },
  c: {
    name: "توهّج المرصد",
    tagline: "ألوان مشعّة وحواف فيروزية متوهجة، وواجهة زجاجية بحواف ذهبية",
    style: {
      ...SPIKE_STYLE,
      key: "c",
      mats: { frond: "#f7c948", teak: "#c4744a", stone: "#7aa7c7", glass: "#38f2e0", cloud: "#e9f6ff", lightbox: "#ffe14d", lantern: "#ffc04d" },
      projectile: "#fffbe0",
      ground: "#0a1430",
      groundTop: "#1f3c6e",
      sea: null,
      outline: { color: "#38f2e0", scale: 1.05 },
      toonSteps: 4,
      lanternGlow: "#ffd76a",
      hemi: ["#7fd8ff", "#170f3d", 1.3],
      moon: ["#d6f6ff", 2.6],
      stars: 0,
      parallax: null,
      depth: 1,
    },
  },
};

/** محتوى تجريبي موسوم: سؤال من تأليفنا بصيغة مرجع الكتاب (ليس من كتاب الوزارة) */
export const DEMO = {
  world: "العلوم · الصف السابع · الفصل الأول",
  level: "الوحدة ٢ · الدرس ٣",
  levelTitle: "خصائص المادة وتغيّراتها",
  stem: "أيّ مما يلي يُعدّ تغيّرًا فيزيائيًا لا ينتج عنه مادة جديدة؟",
  choices: ["ذوبان مكعب الجليد في كوب ماء", "احتراق ورقة في الهواء", "صدأ مسمار حديد مبلل", "تعفّن ثمرة موز"],
  correct: 0,
  explanation: "الذوبان يغيّر حالة الماء من صلب إلى سائل، لكن الماء يبقى ماءً، فلا تتكوّن مادة جديدة.",
  reference: "مثال تجريبي: كتاب العلوم، الصف السابع، الفصل الأول، الوحدة ٢، الدرس ٣، ص ٤٥",
};
