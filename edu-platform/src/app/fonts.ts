import localFont from "next/font/local";

/**
 * خطوط الموقع، تُخدم من نطاقنا نفسه ولا تضيف نطاقًا جديدًا إلى CSP.
 * العربية هي ما يراه الطالب أولًا، فملفاتها الثلاثة الأكثر استخدامًا مع لاتيني الوزن العادي تُحمَّل مسبقًا.
 * كل استدعاء يحمل اسم العائلة نفسه ومدى المحارف، فيجلب المتصفح ملف اللغة والوزن الذي تحتاجه الصفحة فعلًا.
 * قيم display: fallback تعني أن الخط إن تأخر أكثر من 3 ثوان بقي خط النظام، فلا يتبدل النص العربي تحت عين القارئ.
 * الأوزان: الموقع يطلب 400 و500 و700 و800 من Tajawal (وما فوق 800 يسقط إلى 800)، و Cairo ملف متغير واحد.
 * القيم يجب أن تبقى نصوصًا حرفية داخل كل استدعاء، فهكذا يطلبها next/font.
 */
const tajawalArabicCore = localFont({
  src: [
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-arabic-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "fallback",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Tajawal" },
    { prop: "unicode-range", value: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC" },
  ],
});

const tajawalArabicExtra = localFont({
  src: [
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-arabic-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "fallback",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Tajawal" },
    { prop: "unicode-range", value: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC" },
  ],
});

const tajawalLatinCore = localFont({
  src: [{ path: "../../node_modules/@fontsource/tajawal/files/tajawal-latin-400-normal.woff2", weight: "400", style: "normal" }],
  display: "fallback",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Tajawal" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});

const tajawalLatinExtra = localFont({
  src: [
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/tajawal/files/tajawal-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "fallback",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Tajawal" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});

const cairoArabic = localFont({
  src: [{ path: "../../node_modules/@fontsource-variable/cairo/files/cairo-arabic-wght-normal.woff2", weight: "200 1000", style: "normal" }],
  display: "fallback",
  preload: true,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Cairo Variable" },
    { prop: "unicode-range", value: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC" },
  ],
});

const cairoLatin = localFont({
  src: [{ path: "../../node_modules/@fontsource-variable/cairo/files/cairo-latin-wght-normal.woff2", weight: "200 1000", style: "normal" }],
  display: "fallback",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Cairo Variable" },
    { prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  ],
});

/** توضع على html في التخطيط الجذري فتُحمَّل الخطوط ويُحقن تحميلها المسبق في كل المسارات */
export const fontClassNames = [tajawalArabicCore, tajawalArabicExtra, tajawalLatinCore, tajawalLatinExtra, cairoArabic, cairoLatin].map((f) => f.className).join(" ");
