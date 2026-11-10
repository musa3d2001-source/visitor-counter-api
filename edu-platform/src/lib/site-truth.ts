/**
 * كل جملة عامة تعتمد على حال الموقع الفعلية تُكتب هنا فقط: هل الدفع حقيقي؟ هل يوجد فيديو أو مذكرات منشورة؟
 * الصفحات تطلب النص من هذا الملف ولا تكتب ادعاءً بنفسها، واختبار مسح المصدر يفشل إن كتبت صفحة ادعاء دفع مباشرة.
 * الملف نقي بلا اتصال بقاعدة البيانات، أما الحقائق نفسها فتأتي من siteFacts على الخادم.
 */

/** حال الدفع كما تُقال للزائر: حقيقي، أو تجريبي بلا خصم، أو متوقف */
export type PaymentPublicState = "live" | "sandbox" | "off";

export type SiteFacts = {
  payment: PaymentPublicState;
  /** يوجد منتج فيديو ظاهر الآن (البيع مفتوح وفيه درس جاهز) */
  video: boolean;
  /** توجد مذكرة منشورة ظاهرة الآن */
  notes: boolean;
  /** يوجد أي منتج ظاهر للزائر */
  content: boolean;
  /** عدد المعلمين المنشورين */
  teachers: number;
};

export type FaqItem = { q: string; a: string };

/** ما يُعد ادعاءً عن بوابة الدفع أو أمانها. لا يقال إلا والدفع حقيقي */
export const PAYMENT_CLAIM = /ماي\s*فاتورة|my\s*fatoorah|كي\s*نت|knet|دفع(?:\s+إلكتروني)?\s+(?:ال)?آمن|بأمان/i;
/** وعد بأن الشراء «يظهر بعد تأكيد الدفع». لا يقال إلا حين يوجد دفع يُؤكَّد، وإلا البديل الصادق أو لا شيء */
export const AFTER_CONFIRM = /(?:بعد|فور)\s+تأكيد\s+(?:عملية\s+)?الدفع/;
const VIDEO_CLAIM = /فيديو|مرئي/;
const NOTES_CLAIM = /مذكر/;

/** هل يذكر هذا النص ما ليس موجودًا الآن؟ يُستخدم على ما يكتبه المالك في الإعدادات */
export function claimsUntrue(text: string, f: SiteFacts): boolean {
  return (
    (f.payment !== "live" && PAYMENT_CLAIM.test(text)) ||
    (!paymentClaims(f.payment).afterConfirm && AFTER_CONFIRM.test(text)) ||
    (!f.video && VIDEO_CLAIM.test(text)) ||
    (!f.notes && NOTES_CLAIM.test(text))
  );
}

// ---------------------------------------------------------------------------
// الدفع
// ---------------------------------------------------------------------------

export type PaymentClaims = {
  /** سطر الثقة في البطل والتذييل وصفحات الدخول والمنتج والسلة: null يعني لا يُعرض شيء */
  hero: string | null;
  footer: string | null;
  authPerk: string | null;
  productLine: string | null;
  cartLine: string | null;
  /** خطوة الشراء في «كيف تبدأ؟» */
  step: { t: string; p: string };
  /** عنوان صفحة إتمام الشراء الصغير */
  checkoutEyebrow: string;
  checkoutSub: string;
  /** الملاحظة أسفل زر الدفع. null حين لا يوجد دفع */
  checkoutNote: string | null;
  /** شريط أعلى الموقع. null حين لا حاجة له */
  banner: string | null;
  /** يصح قول «يظهر بعد تأكيد الدفع» فقط حين يوجد دفع يُؤكَّد */
  afterConfirm: boolean;
};

/**
 * لا تسمي وسيلة دفع بعينها: الحساب الحقيقي الجديد قد يبدأ بكي نت وحده والبطاقات قيد التفعيل،
 * ولا شيء في الحقائق يعرف ما المفعّل. صفحة البوابة تعرض الوسائل المتاحة فعلًا، والأسئلة الشائعة تقولها بتحفظ
 */
const LIVE_CLAIMS: PaymentClaims = {
  hero: "دفع إلكتروني آمن عبر ماي فاتورة",
  footer: "دفع إلكتروني آمن عبر بوابة ماي فاتورة",
  authPerk: "دفع آمن عبر ماي فاتورة، ولا نحتفظ ببيانات بطاقتك",
  productLine: "دفع آمن عبر ماي فاتورة",
  cartLine: "دفع آمن عبر بوابة ماي فاتورة",
  step: { t: "ادفع بأمان", p: "عبر بوابة ماي فاتورة بالوسائل المفعّلة فيها، ولا نحتفظ ببيانات بطاقتك." },
  checkoutEyebrow: "دفع آمن",
  checkoutSub: "ثلاث خطوات قصيرة، ثم ننقلك إلى صفحة الدفع الآمنة لإتمام العملية.",
  checkoutNote: "ننقلك إلى صفحة الدفع الآمنة لدى ماي فاتورة، ولا نحتفظ ببيانات بطاقتك.",
  banner: null,
  afterConfirm: true,
};

const SANDBOX_CLAIMS: PaymentClaims = {
  hero: null,
  footer: null,
  authPerk: null,
  productLine: null,
  cartLine: null,
  step: { t: "أكمل الشراء", p: "الدفع الآن تجريبي: لا يُخصم أي مبلغ حقيقي." },
  checkoutEyebrow: "بيئة اختبار",
  checkoutSub: "ثلاث خطوات قصيرة، ثم ننقلك إلى صفحة دفع تجريبية لا يُخصم فيها أي مبلغ.",
  checkoutNote: "بيئة اختبار: لن يُخصم أي مبلغ. ننقلك إلى صفحة الدفع التجريبية.",
  banner: "وضع تجريبي: الدفع هنا اختبار فقط ولن يُخصم أي مبلغ حقيقي.",
  afterConfirm: true,
};

const OFF_CLAIMS: PaymentClaims = {
  hero: null,
  footer: null,
  authPerk: null,
  productLine: null,
  cartLine: null,
  step: { t: "أكمل الشراء", p: "الدفع الإلكتروني غير متاح حاليًا. يمكنك التصفح وإضافة ما تريد إلى سلتك." },
  checkoutEyebrow: "الدفع غير متاح حاليًا",
  checkoutSub: "يمكنك مراجعة طلبك هنا، لكن الدفع الإلكتروني متوقف في الوقت الحالي.",
  checkoutNote: null,
  banner: null,
  afterConfirm: false,
};

export function paymentClaims(state: PaymentPublicState): PaymentClaims {
  return state === "live" ? LIVE_CLAIMS : state === "sandbox" ? SANDBOX_CLAIMS : OFF_CLAIMS;
}

/** «يظهر في مكتبتي» على صفحة المنتج: لا يقال ما دام لا يوجد دفع يُؤكَّد */
export function productLibraryLine(state: PaymentPublicState, isBundle: boolean): string | null {
  if (!paymentClaims(state).afterConfirm) return null;
  return isBundle ? "كل محتويات الباقة تظهر في مكتبتي بعد تأكيد الدفع" : "يظهر في مكتبتي بعد تأكيد الدفع";
}

/** كل جملة عامة تقول «يظهر بعد تأكيد الدفع» مع بديلها حين لا يوجد دفع. اختبار مسح المصدر يمنع كتابتها في صفحة */
const LIBRARY_LINES = {
  previewEnd: { on: "النسخة الكاملة تظهر في «مكتبتي» فور تأكيد الدفع.", off: null },
  watchCta: { on: "بعد الشراء يظهر المحتوى في مكتبتك فور تأكيد الدفع، وتتابع من حيث توقفت.", off: null },
  contactTile: { on: "كل ما اشتريته يظهر هناك بعد تأكيد الدفع.", off: "كل ما تحصل عليه من محتوى يظهر هناك، وتفتحه من أي جهاز." },
  libraryEmpty: { on: "ما تشتريه يظهر هنا بعد تأكيد الدفع.", off: "ما تحصل عليه من محتوى يظهر هنا." },
  bundleContents: { on: "كل ما تحصل عليه عند شراء الباقة، ويظهر في مكتبتك بعد تأكيد الدفع.", off: "كل ما تضمه هذه الباقة." },
  cartSub: { on: "راجع اختياراتك ثم أكمل الشراء. يظهر كل شيء في مكتبتك بعد تأكيد الدفع.", off: "راجع اختياراتك هنا. الدفع الإلكتروني غير متاح حاليًا." },
  cartPerk: { on: "يظهر في مكتبتك بعد تأكيد الدفع", off: null },
  homeLibrary: { on: "، وكل ما تشتريه تجده في «مكتبتي» بعد تأكيد الدفع", off: null },
} as const satisfies Record<string, { on: string; off: string | null }>;

export type LibraryLineKey = keyof typeof LIBRARY_LINES;

/** جمل «يظهر في مكتبتك» خارج سطر صفحة المنتج: الوعد حين يوجد دفع يُؤكَّد، وإلا البديل الصادق أو لا شيء */
export function libraryNote(state: PaymentPublicState, key: LibraryLineKey): string | null {
  return paymentClaims(state).afterConfirm ? LIBRARY_LINES[key].on : LIBRARY_LINES[key].off;
}

export const ORDER_PAYMENT_FALLBACK = "الدفع الإلكتروني";

// ---------------------------------------------------------------------------
// الشعار والبطل
// ---------------------------------------------------------------------------

/** الافتراضي مبني على إطلاق المذكرات فقط. ما يعرضه الموقع فعلًا تقرره publicTagline وpublicHero حسب الحقائق */
export const DEFAULT_TAGLINE = "مذكرات مرتبة لطلاب الكويت";
export const DEFAULT_HERO_TITLE = "اختر صفك، وابدأ من الدرس الذي تحتاجه اليوم.";
export const DEFAULT_HERO_SUBTITLE = "مذكرات مرتبة حسب الصف والمادة، تختار منها ما تحتاجه فقط.";

const TAGLINE_BOTH = "شروحات فيديو ومذكرات لطلاب الكويت";
const TAGLINE_VIDEO = "شروحات فيديو لطلاب الكويت";
const TAGLINE_NONE = "منصة تعليمية لطلاب الكويت";

/** قيم حفظها النموذج كما هي، فلا تُعامل كنص كتبه المالك بيده */
const AUTO_TAGLINES = new Set([DEFAULT_TAGLINE, TAGLINE_BOTH, TAGLINE_VIDEO, TAGLINE_NONE]);
const AUTO_SUBTITLES = new Set([
  DEFAULT_HERO_SUBTITLE,
  // النص الافتراضي القديم، وقد يكون محفوظًا في قاعدة البيانات بعد أول حفظ للنموذج
  "شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار، ومذكرات جاهزة للطباعة. ادفع لما تحتاجه فقط، ويظهر في مكتبتك فور تأكيد الدفع.",
]);

function autoTagline(f: SiteFacts): string {
  if (f.video && f.notes) return TAGLINE_BOTH;
  if (f.video) return TAGLINE_VIDEO;
  if (f.notes) return DEFAULT_TAGLINE;
  return TAGLINE_NONE;
}

function autoSubtitle(f: SiteFacts): string {
  const lead = f.video && f.notes ? "شروحات بالفيديو ومذكرات مرتبة حسب الصف والمادة" : f.video ? "شروحات بالفيديو مرتبة حسب الصف والمادة" : f.notes ? "مذكرات مرتبة حسب الصف والمادة" : "محتوى مرتب حسب الصف والمادة";
  return `${lead}، تختار منها ما تحتاجه فقط.${paymentClaims(f.payment).afterConfirm ? " ويظهر ما تشتريه في مكتبتك بعد تأكيد الدفع." : ""}`;
}

export const DEFAULT_FOOTER_NOTE = "جميع الحقوق محفوظة. المحتوى مخصص للاستخدام الشخصي للطالب فقط.";

/** نص التذييل الظاهر في كل صفحة: نص المالك ما دام صادقًا، وإلا النص الافتراضي الذي لا يذكر دفعًا ولا محتوى */
export function publicFooterNote(stored: string, f: SiteFacts): string {
  if (!stored) return "";
  return claimsUntrue(stored, f) ? DEFAULT_FOOTER_NOTE : stored;
}

/** الشعار الظاهر: نص المالك ما دام صادقًا، وإلا ما يطابق الموجود */
export function publicTagline(stored: string, f: SiteFacts): string {
  if (!stored) return "";
  return AUTO_TAGLINES.has(stored) || claimsUntrue(stored, f) ? autoTagline(f) : stored;
}

export const EMPTY_HERO = {
  title: "نجهّز المحتوى الدراسي الآن.",
  subtitle: "لم يُنشر أي محتوى بعد. سيظهر هنا مرتبًا حسب الصف والمادة.",
};

/** البطل الظاهر. الموقع الفارغ له بطل ثابت حتى فوق نص المالك: لا طريقة لمعرفة أن نصه لا يَعد بما ليس موجودًا */
export function publicHero(stored: { title: string; subtitle: string }, f: SiteFacts): { title: string; subtitle: string } {
  if (!f.content) return EMPTY_HERO;
  const title = claimsUntrue(stored.title, f) ? DEFAULT_HERO_TITLE : stored.title;
  if (!stored.subtitle) return { title, subtitle: "" };
  const subtitle = AUTO_SUBTITLES.has(stored.subtitle) || claimsUntrue(stored.subtitle, f) ? autoSubtitle(f) : stored.subtitle;
  return { title, subtitle };
}

export type TrustKey = "pay" | "library" | "resume" | "devices";

/** شريط المزايا أسفل البطل: ما هو صحيح الآن فقط */
export function heroTrust(f: SiteFacts): { key: TrustKey; text: string }[] {
  const pay = paymentClaims(f.payment);
  return [
    pay.hero ? { key: "pay" as const, text: pay.hero } : null,
    pay.afterConfirm ? { key: "library" as const, text: "يظهر في مكتبتك بعد تأكيد الدفع" } : null,
    f.video ? { key: "resume" as const, text: "تكمل الفيديو من حيث توقفت" } : null,
    { key: "devices" as const, text: "على الجوال والحاسوب" },
  ].filter((x) => x !== null);
}

export type AuthPerkKey = "library" | "resume" | "pay";

/** مزايا صفحات الدخول وإنشاء الحساب */
export function authPerks(f: SiteFacts): { key: AuthPerkKey; text: string }[] {
  const pay = paymentClaims(f.payment);
  return [
    { key: "library" as const, text: pay.afterConfirm ? "ما تشتريه يظهر في «مكتبتي» بعد تأكيد الدفع" : "كل ما يتاح لك تجده في «مكتبتي»" },
    { key: "resume" as const, text: f.video ? "تكمل الفيديو من حيث توقفت، على الجوال والحاسوب" : "مكتبتك تفتح على الجوال والحاسوب" },
    pay.authPerk ? { key: "pay" as const, text: pay.authPerk } : null,
  ].filter((x) => x !== null);
}

/** خطوات «كيف تبدأ؟». الموقع الفارغ لا يعرضها أصلًا */
export function homeSteps(f: SiteFacts): { t: string; p: string }[] {
  const pay = paymentClaims(f.payment);
  const previews =
    f.video && f.notes
      ? { t: "شاهد المعاينة مجانًا", p: "حيث تجد شارة «معاينة مجانية» تشاهد درسًا أو تقرأ أول الصفحات قبل الشراء، بدون حساب." }
      : f.video
        ? { t: "شاهد المعاينة مجانًا", p: "حيث تجد شارة «معاينة مجانية» تشاهد درسًا قبل الشراء، بدون حساب." }
        : { t: "اطّلع على المعاينة مجانًا", p: "حيث تجد «أول الصفحات مجانًا» تقرأ قبل الشراء، بدون حساب." };
  const library = pay.afterConfirm ? "بعد تأكيد الدفع يظهر ما اشتريته في «مكتبتي»" : "كل ما يتاح لك تجده في «مكتبتي»";
  return [
    { t: "اختر صفك ومادتك", p: f.teachers > 0 ? "كل شيء مرتب حسب الصف والمادة، أو ابدأ من صفحة معلمك مباشرة." : "كل شيء مرتب حسب الصف والمادة." },
    previews,
    pay.step,
    { t: "ذاكر من مكتبتك", p: `${library}${f.video ? "، وتكمل الفيديو من حيث توقفت" : ""}.` },
  ];
}

/** عنوان لوح الصفوف */
export function gradesHeading(f: SiteFacts): { title: string; highlight: string | null; sub: string | null } {
  if (!f.content) return { title: "الصفوف الدراسية", highlight: null, sub: null };
  const what = f.video && f.notes ? "شروحات الفيديو والمراجعات والمذكرات مرتبة" : f.video ? "شروحات الفيديو والمراجعات مرتبة" : f.notes ? "المذكرات مرتبة" : "المحتوى مرتبًا";
  return { title: "في أي صف أنت؟", highlight: "ابدأ من هنا", sub: `اختر صفك لتجد ${what} حسب المادة.` };
}

export const EMPTY_GRADES = { title: "المحتوى قيد التجهيز", description: "لم يُنشر محتوى بعد. سيظهر هنا حسب كل صف فور نشره." };

/** وصف صفحة الصف لمحركات البحث */
export function gradeMeta(gradeName: string, stageName: string, f: SiteFacts): { title: string; description: string } {
  const place = `لطلاب ${gradeName}، ${stageName} في الكويت.`;
  if (f.video && f.notes) return { title: `شروحات ومذكرات ${gradeName}`, description: `شروحات بالفيديو ومذكرات مرتبة حسب المادة ${place}` };
  if (f.video) return { title: `شروحات ${gradeName}`, description: `شروحات بالفيديو مرتبة حسب المادة ${place}` };
  if (f.notes) return { title: `مذكرات ${gradeName}`, description: `مذكرات مرتبة حسب المادة ${place}` };
  return { title: `محتوى ${gradeName}`, description: `محتوى مرتب حسب المادة ${place}` };
}

// ---------------------------------------------------------------------------
// المعلمون
// ---------------------------------------------------------------------------

export type TeacherCopy = { eyebrow: string; lead: string | null; highlight: string; sub: string; section: string };

/** عدد المعلمين الحقيقي يحدد الصيغة: لا «معلميك» حين يوجد معلم واحد أو لا أحد */
export function teachersCopy(n: number, f: SiteFacts): TeacherCopy {
  if (n === 0) return { eyebrow: "معلمو المنصة", lead: null, highlight: "معلمو المنصة", sub: "لم يُنشر أي معلم بعد. ستظهر صفحات المعلمين هنا فور نشرها.", section: "" };
  const preview = f.video ? "وحيث تجد «معاينة مجانية» تشاهد درسًا قبل الشراء." : "وتتصفح ما نشره حسب الصف والمادة.";
  const section = "لكل معلم صفحة تجمع ما نشره حسب الصف والمادة.";
  if (n === 1) return { eyebrow: "معلم المنصة", lead: "تعرّف على", highlight: "معلم المنصة", sub: `صفحة واحدة تجمع ما نشره، ${preview}`, section };
  return { eyebrow: "معلمو المنصة", lead: "تعرّف على", highlight: "معلميك", sub: `اختر صفك ومادتك لتصل إلى معلمك مباشرة، ${preview}`, section };
}

// ---------------------------------------------------------------------------
// الأسئلة الشائعة
// ---------------------------------------------------------------------------

type FaqRule = { value: FaqItem; known: FaqItem[]; render: (f: SiteFacts) => FaqItem | null };

const LIBRARY_LEAD = "يظهر ما اشتريته في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول";
const FAQ_LIBRARY: FaqItem = { q: "أين أجد ما اشتريته؟", a: `بعد تأكيد الدفع ${LIBRARY_LEAD}.` };
const FAQ_ACCESS: FaqItem = {
  q: "كم مدة الوصول إلى المحتوى؟",
  a: "مكتوبة في صفحة كل منتج بجوار السعر: بعضها بلا تاريخ انتهاء، وبعضها لعدد أيام من تاريخ الشراء أو حتى تاريخ محدد.",
};
const FAQ_PREVIEW: FaqItem = { q: "هل أستطيع الاطلاع قبل الشراء؟", a: "نعم، حيث تجد «أول الصفحات مجانًا» تقرأ قبل الشراء، بدون الحاجة لحساب." };
const FAQ_KINDS: FaqItem = {
  q: "ما الفرق بين شرح الوحدة والدورة الكاملة والمراجعة؟",
  a: "شرح الوحدة يغطي وحدة واحدة بالفيديو. الدورة الكاملة تجمع وحدات الفصل. مراجعة الاختبار القصير وليلة الاختبار دروس مركزة قبل موعده.",
};
const FAQ_METHODS: FaqItem = {
  q: "ما طرق الدفع المتاحة؟",
  a: "الدفع إلكتروني عبر بوابة ماي فاتورة، ويشمل كي نت والبطاقات البنكية حسب الوسائل المفعّلة. لا نحتفظ ببيانات بطاقتك.",
};
const FAQ_REFUND: FaqItem = {
  q: "هل يمكن استرجاع المبلغ؟",
  a: "نعم في حالات محددة: إذا خُصم المبلغ ولم يظهر المحتوى في مكتبتك، أو تكرر الدفع بالخطأ، أو كان الملف تالفًا ولم نصلحه. تواصل معنا خلال ٧ أيام من الشراء مع رقم الطلب.",
};
const FAQ_PRINT: FaqItem = {
  q: "هل يمكنني طباعة المذكرة؟",
  a: "بعض المذكرات متاحة للتنزيل والطباعة، وبعضها للقراءة داخل المنصة فقط. يظهر ذلك بوضوح في صفحة كل مذكرة.",
};

const FAQ_RULES: FaqRule[] = [
  {
    value: FAQ_LIBRARY,
    known: [
      FAQ_LIBRARY,
      { q: FAQ_LIBRARY.q, a: "بعد تأكيد الدفع يظهر الشرح أو المذكرة مباشرة في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول، وتكمل الفيديو من حيث توقفت." },
    ],
    render: (f) => ({
      q: FAQ_LIBRARY.q,
      a: `${paymentClaims(f.payment).afterConfirm ? `بعد تأكيد الدفع ${LIBRARY_LEAD}` : "كل ما يتاح لك تجده في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول"}${f.video ? "، وتكمل الفيديو من حيث توقفت" : ""}.`,
    }),
  },
  {
    value: FAQ_ACCESS,
    known: [FAQ_ACCESS, { q: "كم مدة الوصول إلى الشروحات؟", a: "مكتوبة في صفحة كل شرح بجوار السعر: بعضها بلا تاريخ انتهاء، وبعضها لعدد أيام من تاريخ الشراء أو حتى نهاية الفصل." }],
    render: () => FAQ_ACCESS,
  },
  {
    value: FAQ_PREVIEW,
    known: [FAQ_PREVIEW, { q: "هل أستطيع المشاهدة قبل الشراء؟", a: "نعم. أغلب الشروحات فيها درس مجاني للمعاينة، وأغلب المذكرات فيها أول صفحات مجانًا، بدون الحاجة لحساب." }],
    render: (f) => {
      if (f.video && f.notes) return { q: "هل أستطيع المشاهدة قبل الشراء؟", a: "نعم، حيث تجد شارة «معاينة مجانية» تشاهد درسًا، وحيث تجد «أول الصفحات مجانًا» تقرأ قبل الشراء، بدون الحاجة لحساب." };
      if (f.video) return { q: "هل أستطيع المشاهدة قبل الشراء؟", a: "نعم، حيث تجد شارة «معاينة مجانية» تشاهد درسًا قبل الشراء، بدون الحاجة لحساب." };
      return FAQ_PREVIEW;
    },
  },
  {
    value: FAQ_KINDS,
    known: [
      FAQ_KINDS,
      { q: FAQ_KINDS.q, a: "شرح الوحدة يغطي وحدة واحدة بالفيديو. الدورة الكاملة تجمع وحدات الفصل كلها بسعر أقل من شرائها منفردة. مراجعة الاختبار القصير وليلة الاختبار دروس مركزة على الأسئلة المتوقعة." },
    ],
    render: (f) => (f.video ? FAQ_KINDS : null),
  },
  { value: FAQ_METHODS, known: [FAQ_METHODS], render: (f) => (f.payment === "live" ? FAQ_METHODS : null) },
  { value: FAQ_REFUND, known: [FAQ_REFUND], render: () => FAQ_REFUND },
  { value: FAQ_PRINT, known: [FAQ_PRINT], render: (f) => (f.notes ? FAQ_PRINT : null) },
];

/** النصوص الافتراضية كما تُحفظ وتظهر للمالك في النموذج. الظاهر للزائر يمر دائمًا عبر publicFaq */
export const DEFAULT_FAQ: FaqItem[] = FAQ_RULES.map((r) => r.value);

/** الأسئلة الظاهرة: الافتراضية تتبع الحقائق، وما كتبه المالك يبقى إلا إن ذكر ما ليس موجودًا */
export function publicFaq(stored: FaqItem[], f: SiteFacts): FaqItem[] {
  const out: FaqItem[] = [];
  for (const item of stored) {
    const rule = FAQ_RULES.find((r) => r.known.some((k) => k.q === item.q && k.a === item.a));
    if (rule) {
      const shown = f.content ? rule.render(f) : null;
      if (shown) out.push(shown);
      continue;
    }
    if (!claimsUntrue(`${item.q} ${item.a}`, f)) out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// هوية البائع
// ---------------------------------------------------------------------------

export type SellerSettings = { seller_legal_name: string; seller_license_number: string; seller_address: string };

/** ما أدخله المالك من هوية البائع فقط. لا يُعرض حقل فارغ ولا عنوان بلا قيمة */
export function sellerIdentity(s: SellerSettings): { key: string; label: string; value: string }[] {
  return [
    { key: "name", label: "البائع", value: s.seller_legal_name },
    { key: "license", label: "رقم الرخصة التجارية", value: s.seller_license_number },
    { key: "address", label: "العنوان", value: s.seller_address },
  ]
    .map((x) => ({ ...x, value: x.value.trim() }))
    .filter((x) => x.value);
}
