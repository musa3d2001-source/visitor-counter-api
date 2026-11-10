import { describe, expect, it } from "vitest";
import {
  AFTER_CONFIRM,
  authPerks,
  claimsUntrue,
  DEFAULT_FAQ,
  DEFAULT_FOOTER_NOTE,
  libraryNote,
  publicFooterNote,
  type LibraryLineKey,
  EMPTY_HERO,
  gradeMeta,
  gradesHeading,
  heroTrust,
  homeSteps,
  PAYMENT_CLAIM,
  paymentClaims,
  productLibraryLine,
  publicFaq,
  publicHero,
  publicTagline,
  sellerIdentity,
  teachersCopy,
  type SiteFacts,
} from "@/lib/site-truth";

const facts = (over: Partial<SiteFacts> = {}): SiteFacts => ({ payment: "live", video: true, notes: true, content: true, teachers: 3, ...over });
const notesOnly = (over: Partial<SiteFacts> = {}) => facts({ video: false, ...over });
const VIDEO = /فيديو|مرئي/;
const LIBRARY_KEYS: LibraryLineKey[] = ["previewEnd", "watchCta", "contactTile", "libraryEmpty", "bundleContents", "cartSub", "cartPerk", "homeLibrary"];

const LEGACY_SUBTITLE = "شرح بالفيديو لكل وحدة، ومراجعات قبل الاختبارات القصيرة وليلة الاختبار، ومذكرات جاهزة للطباعة. ادفع لما تحتاجه فقط، ويظهر في مكتبتك فور تأكيد الدفع.";
const LEGACY_TAGLINE = "شروحات فيديو ومذكرات لطلاب الكويت";
/** الأسئلة الافتراضية القديمة كما حُفظت في قواعد بيانات قائمة عند أول حفظ لنموذج الإعدادات */
const LEGACY_FAQ = [
  { q: "أين أجد ما اشتريته؟", a: "بعد تأكيد الدفع يظهر الشرح أو المذكرة مباشرة في صفحة «مكتبتي»، وتفتحه من أي جهاز بعد تسجيل الدخول، وتكمل الفيديو من حيث توقفت." },
  { q: "كم مدة الوصول إلى الشروحات؟", a: "مكتوبة في صفحة كل شرح بجوار السعر: بعضها بلا تاريخ انتهاء، وبعضها لعدد أيام من تاريخ الشراء أو حتى نهاية الفصل." },
  { q: "هل أستطيع المشاهدة قبل الشراء؟", a: "نعم. أغلب الشروحات فيها درس مجاني للمعاينة، وأغلب المذكرات فيها أول صفحات مجانًا، بدون الحاجة لحساب." },
  { q: "ما الفرق بين شرح الوحدة والدورة الكاملة والمراجعة؟", a: "شرح الوحدة يغطي وحدة واحدة بالفيديو. الدورة الكاملة تجمع وحدات الفصل كلها بسعر أقل من شرائها منفردة. مراجعة الاختبار القصير وليلة الاختبار دروس مركزة على الأسئلة المتوقعة." },
  { q: "ما طرق الدفع المتاحة؟", a: "الدفع إلكتروني عبر بوابة ماي فاتورة، وتظهر لك الوسائل المتاحة في صفحة إتمام الشراء. لا نحتفظ ببيانات بطاقتك." },
];

describe("payment claims follow the real state", () => {
  it.each(["sandbox", "off"] as const)("%s: no field names the gateway or calls it secure", (state) => {
    const c = paymentClaims(state);
    expect([c.hero, c.footer, c.authPerk, c.productLine, c.cartLine]).toEqual([null, null, null, null, null]);
    expect(JSON.stringify(c)).not.toMatch(PAYMENT_CLAIM);
  });

  it("live says what it is", () => {
    const c = paymentClaims("live");
    for (const line of [c.hero, c.footer, c.authPerk, c.productLine, c.cartLine, c.checkoutNote]) expect(line).toMatch(PAYMENT_CLAIM);
    expect(c.banner).toBeNull();
  });

  it("sandbox says no money moves, wherever it speaks of paying", () => {
    const c = paymentClaims("sandbox");
    expect(c.banner).toContain("لن يُخصم");
    expect(c.checkoutNote).toContain("لن يُخصم");
    expect(c.checkoutSub).toContain("لا يُخصم");
    expect(c.step.p).toContain("لا يُخصم");
  });

  it("the secure-page phrase in any form counts as a claim", () => {
    for (const phrase of ["صفحة الدفع الآمنة", "دفع آمن", "دفع إلكتروني آمن", "ادفع بأمان", "كي نت", "KNET", "ماي فاتورة", "MyFatoorah"]) expect(phrase).toMatch(PAYMENT_CLAIM);
  });

  it("live names no payment method: the account may have KNET alone or cards alone", () => {
    const c = paymentClaims("live");
    // «لا نحتفظ ببيانات بطاقتك» وعد عن البيانات وليس ادعاءً بوسيلة مفعّلة
    const lines = [c.hero, c.footer, c.authPerk, c.productLine, c.cartLine, c.step.t, c.step.p, c.checkoutEyebrow, c.checkoutSub, c.checkoutNote].map((x) => (x ?? "").replace("بيانات بطاقتك", ""));
    for (const line of lines) expect(line).not.toMatch(/كي\s*نت|knet|بطاق/i);
  });

  it("with payment off nothing promises an order that will be confirmed", () => {
    expect(productLibraryLine("off", false)).toBeNull();
    expect(productLibraryLine("sandbox", false)).toContain("بعد تأكيد الدفع");
    expect(productLibraryLine("live", true)).toContain("كل محتويات الباقة");
    expect(JSON.stringify(heroTrust(facts({ payment: "off" })))).not.toContain("تأكيد الدفع");
    expect(JSON.stringify(authPerks(facts({ payment: "off" })))).not.toContain("تأكيد الدفع");
    expect(JSON.stringify(homeSteps(facts({ payment: "off" })))).not.toContain("تأكيد الدفع");
  });

  it.each(LIBRARY_KEYS)("%s promises the library after confirmation only when a payment can be confirmed", (key) => {
    expect(libraryNote("live", key)).toMatch(AFTER_CONFIRM);
    expect(libraryNote("sandbox", key)).toMatch(AFTER_CONFIRM);
    const off = libraryNote("off", key);
    if (off !== null) {
      expect(off).not.toMatch(AFTER_CONFIRM);
      expect(off).not.toMatch(PAYMENT_CLAIM);
    }
  });

  it("the promise is caught in each wording the pages used", () => {
    for (const phrase of ["فور تأكيد الدفع", "بعد تأكيد الدفع", "بعد تأكيد عملية الدفع"]) expect(phrase).toMatch(AFTER_CONFIRM);
    expect("بانتظار تأكيد الدفع").not.toMatch(AFTER_CONFIRM);
  });
});

describe("what the owner wrote stays unless it says what is not there", () => {
  it("catches each kind of untrue claim", () => {
    expect(claimsUntrue("شروحات فيديو", notesOnly())).toBe(true);
    expect(claimsUntrue("دروس مرئية", notesOnly())).toBe(true);
    expect(claimsUntrue("مذكرات جاهزة", facts({ notes: false }))).toBe(true);
    expect(claimsUntrue("دفع آمن", facts({ payment: "sandbox" }))).toBe(true);
    expect(claimsUntrue("دفع آمن", facts({ payment: "off" }))).toBe(true);
    expect(claimsUntrue("دفع آمن وشروحات فيديو ومذكرات", facts())).toBe(false);
    expect(claimsUntrue("يظهر في مكتبتك بعد تأكيد الدفع", facts({ payment: "off" }))).toBe(true);
    expect(claimsUntrue("يظهر في مكتبتك بعد تأكيد الدفع", facts({ payment: "sandbox" }))).toBe(false);
  });

  it("the footer note the owner wrote is shown only while it is true", () => {
    const untrue = "دفع آمن بكي نت وشروحات فيديو لكل وحدة";
    expect(publicFooterNote(untrue, notesOnly({ payment: "off" }))).toBe(DEFAULT_FOOTER_NOTE);
    expect(publicFooterNote(untrue, facts())).toBe(untrue);
    expect(publicFooterNote("كل الحقوق لأصحابها.", notesOnly({ payment: "off" }))).toBe("كل الحقوق لأصحابها.");
    expect(publicFooterNote("", notesOnly({ payment: "off" }))).toBe("");
    // البديل نفسه صادق في أسوأ الحالات
    expect(claimsUntrue(DEFAULT_FOOTER_NOTE, facts({ payment: "off", video: false, notes: false, content: false }))).toBe(false);
  });

  it("the owner's honest tagline and hero are shown as written", () => {
    expect(publicTagline("منصتنا لكل طالب", notesOnly())).toBe("منصتنا لكل طالب");
    expect(publicHero({ title: "عنوان المالك", subtitle: "وصف المالك" }, notesOnly())).toEqual({ title: "عنوان المالك", subtitle: "وصف المالك" });
  });

  it("an owner who cleared a field keeps it clear", () => {
    expect(publicTagline("", notesOnly())).toBe("");
    expect(publicHero({ title: "عنوان", subtitle: "" }, notesOnly()).subtitle).toBe("");
  });

  it("the owner's text naming closed video gives way to what exists", () => {
    expect(publicTagline("أفضل فيديو تعليمي", notesOnly())).not.toMatch(VIDEO);
    const hero = publicHero({ title: "دروس فيديو ممتعة", subtitle: "فيديو لكل درس" }, notesOnly());
    expect(hero.title).not.toMatch(VIDEO);
    expect(hero.subtitle).not.toMatch(VIDEO);
  });
});

describe("stored old defaults do not bring old claims back", () => {
  it("the tagline saved by the form follows the facts", () => {
    expect(publicTagline(LEGACY_TAGLINE, notesOnly())).toBe("مذكرات مرتبة لطلاب الكويت");
    expect(publicTagline(LEGACY_TAGLINE, facts())).toBe(LEGACY_TAGLINE);
    expect(publicTagline("مذكرات مرتبة لطلاب الكويت", facts())).toBe(LEGACY_TAGLINE);
    expect(publicTagline(LEGACY_TAGLINE, facts({ notes: false }))).not.toContain("مذكر");
  });

  it("the subtitle saved by the form follows the facts", () => {
    const shown = publicHero({ title: "عنوان", subtitle: LEGACY_SUBTITLE }, notesOnly()).subtitle;
    expect(shown).not.toMatch(VIDEO);
    expect(shown).toContain("مذكرات");
    expect(publicHero({ title: "عنوان", subtitle: LEGACY_SUBTITLE }, facts()).subtitle).toContain("بالفيديو");
    expect(publicHero({ title: "عنوان", subtitle: LEGACY_SUBTITLE }, facts({ payment: "off" })).subtitle).not.toContain("تأكيد الدفع");
  });

  it("the old FAQ loses its video answers when video is closed", () => {
    const shown = publicFaq(LEGACY_FAQ, notesOnly());
    expect(JSON.stringify(shown)).not.toMatch(VIDEO);
    expect(shown.map((f) => f.q)).not.toContain("ما الفرق بين شرح الوحدة والدورة الكاملة والمراجعة؟");
    expect(shown.map((f) => f.q)).toContain("أين أجد ما اشتريته؟");
  });

  it("no answer can claim most lessons have a free preview", () => {
    expect(JSON.stringify(publicFaq(LEGACY_FAQ, facts()))).not.toContain("أغلب");
  });
});

describe("the FAQ", () => {
  it("the payment answer exists only while payment is real", () => {
    const methods = "ما طرق الدفع المتاحة؟";
    expect(publicFaq(DEFAULT_FAQ, facts()).map((f) => f.q)).toContain(methods);
    expect(publicFaq(DEFAULT_FAQ, facts({ payment: "sandbox" })).map((f) => f.q)).not.toContain(methods);
    expect(publicFaq(DEFAULT_FAQ, facts({ payment: "off" })).map((f) => f.q)).not.toContain(methods);
  });

  it("video answers appear when video is on sale", () => {
    expect(JSON.stringify(publicFaq(DEFAULT_FAQ, facts()))).toContain("تكمل الفيديو من حيث توقفت");
    expect(publicFaq(DEFAULT_FAQ, facts()).map((f) => f.q)).toContain("ما الفرق بين شرح الوحدة والدورة الكاملة والمراجعة؟");
  });

  it("the printing answer needs notes", () => {
    expect(publicFaq(DEFAULT_FAQ, facts({ notes: false })).map((f) => f.q)).not.toContain("هل يمكنني طباعة المذكرة؟");
  });

  it("an empty site answers nothing about content that is not there", () => {
    expect(publicFaq(DEFAULT_FAQ, facts({ content: false, video: false, notes: false }))).toEqual([]);
  });

  it("the owner's own question stays unless it is untrue", () => {
    const own = { q: "كيف أتواصل معكم؟", a: "عبر الرسائل." };
    const untrue = { q: "هل عندكم فيديو؟", a: "نعم." };
    expect(publicFaq([own, untrue], notesOnly())).toEqual([own]);
    expect(publicFaq([own, untrue], facts())).toEqual([own, untrue]);
  });
});

describe("the hero and steps", () => {
  it("an empty site always shows the fixed honest hero, even over the owner's words", () => {
    const f = facts({ content: false, video: false, notes: false });
    expect(publicHero({ title: "مئات الدروس بانتظارك", subtitle: "كل شيء جاهز" }, f)).toEqual(EMPTY_HERO);
  });

  it("the grade heading does not say everything is ready", () => {
    expect(gradesHeading(facts()).highlight).toBe("ابدأ من هنا");
    expect(JSON.stringify(gradesHeading(facts()))).not.toContain("جاهز");
    expect(gradesHeading(facts({ content: false }))).toEqual({ title: "الصفوف الدراسية", highlight: null, sub: null });
  });

  it("describes only what exists", () => {
    expect(gradesHeading(notesOnly()).sub).toBe("اختر صفك لتجد المذكرات مرتبة حسب المادة.");
    expect(gradesHeading(facts({ notes: false })).sub).not.toContain("مذكر");
    expect(gradeMeta("الصف السادس", "المتوسطة", notesOnly()).description).not.toMatch(VIDEO);
    expect(gradeMeta("الصف السادس", "المتوسطة", facts({ video: false, notes: false })).description).not.toMatch(/مذكر|فيديو/);
  });

  it("the steps and strips say nothing about video when it is closed", () => {
    expect(JSON.stringify([homeSteps(notesOnly()), heroTrust(notesOnly()), authPerks(notesOnly())])).not.toMatch(VIDEO);
    expect(JSON.stringify(heroTrust(facts()))).toContain("تكمل الفيديو");
  });

  it("there is always a fourth step, and the step points at teachers only if there are any", () => {
    expect(homeSteps(notesOnly())).toHaveLength(4);
    expect(homeSteps(facts({ teachers: 0 }))[0].p).not.toContain("معلم");
    expect(homeSteps(facts())[0].p).toContain("معلمك");
  });
});

describe("teachers copy counts the real teachers", () => {
  it("none", () => {
    const c = teachersCopy(0, notesOnly());
    expect(c.highlight).toBe("معلمو المنصة");
    expect(c.sub).toContain("لم يُنشر أي معلم بعد");
    expect(c.lead).toBeNull();
  });

  it("one is not addressed as many", () => {
    const c = teachersCopy(1, notesOnly());
    expect(c.highlight).toBe("معلم المنصة");
    expect(c.eyebrow).toBe("معلم المنصة");
  });

  it("many", () => expect(teachersCopy(2, facts()).highlight).toBe("معلميك"));

  it("promises a preview lesson only when video is on sale", () => {
    expect(teachersCopy(2, notesOnly()).sub).not.toMatch(/درس|فيديو/);
    expect(teachersCopy(2, facts()).sub).toContain("معاينة مجانية");
  });
});

describe("seller identity", () => {
  it("shows only what was entered", () => {
    expect(sellerIdentity({ seller_legal_name: "", seller_license_number: "", seller_address: "" })).toEqual([]);
    expect(sellerIdentity({ seller_legal_name: "شركة فرقد", seller_license_number: "", seller_address: "" }).map((x) => x.label)).toEqual(["البائع"]);
    expect(sellerIdentity({ seller_legal_name: "شركة فرقد", seller_license_number: "123", seller_address: "الكويت" })).toHaveLength(3);
  });
});
