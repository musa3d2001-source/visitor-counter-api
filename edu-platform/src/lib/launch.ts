import { CONSENT_VERSIONS, LEGAL_PAGE_VERSIONS } from "./consent";
import { ar } from "./design";
import { formatDateTime } from "./utils";

/**
 * خطوات الإطلاق: ما يجب أن يكون صحيحًا قبل أن تدفع أسرة دينارًا حقيقيًا.
 *
 * ملف نقي بلا قاعدة بيانات ولا متغيرات بيئة: يأخذ الحقائق (قيم منطقية وأعداد وتواريخ فقط، لا قيمة سر ولا طولها أبدًا)
 * والتأشيرات اليدوية، ويعيد كل خطوة بحالتها، وجملة واحدة بما يفعله المالك، ومكان فعله، والحكم العام.
 * الحكم لا يقول «جاهز» ما دامت خطوة لازمة واحدة غير منجزة أو تعذر فحصها.
 */

// ---------------------------------------------------------------------------
// الخطوات اليدوية
// ---------------------------------------------------------------------------

/** نسخ الوثائق التي يراجعها المحامي، ومنها سياسة الاسترجاع وصفحة البلاغات. تغيّر أي نسخة يعيد خطوة المراجعة مفتوحة */
const LEGAL_VERSION = Object.entries({ ...CONSENT_VERSIONS, ...LEGAL_PAGE_VERSIONS })
  .map(([doc, version]) => `${doc} ${version}`)
  .join("; ");

/**
 * الخطوات التي لا يستطيع النظام كشفها، ونسخة نص كل منها.
 * غيّر النسخة عند تغيير ما تطلبه الخطوة تغييرًا جوهريًا (مثل بند جديد في قائمة التجربة): التأشير القديم يعود مفتوحًا.
 */
export const MANUAL_VERSIONS = {
  vercel_pro: "1",
  supabase_pro: "1",
  restore_drill: "1",
  uptime_monitor: "1",
  commercial_license: "1",
  lawyer_review: LEGAL_VERSION,
  bunny_cdn_token: "1",
  bunny_mp4_off: "1",
  bunny_real_test: "1",
  sandbox_pass: "1",
  portal_webhook: "1",
  live_payment: "1",
} as const;

export type ManualKey = keyof typeof MANUAL_VERSIONS;
export const MANUAL_KEYS = Object.keys(MANUAL_VERSIONS) as ManualKey[];

export function isManualKey(value: string): value is ManualKey {
  return Object.prototype.hasOwnProperty.call(MANUAL_VERSIONS, value);
}

/** ما يجب أن تؤكده تجربة كاملة على بيئة MyFatoorah التجريبية الحقيقية (من تقرير مسار الدفع) */
export const SANDBOX_PASS_CHECKS = [
  "دفع ناجح بكي نت وبالبطاقة يفتح المحتوى، ودفع مرفوض لا يمنح شيئًا.",
  "قيمة الفاتورة تساوي مبلغ الطلب، ولا تُضاف رسوم البوابة على العميل.",
  "البوابة تكتب العملة KD، والمنصة تقبلها وتؤكد الدفع.",
  "إشعار Webhook يُقبل دون ترويسة الإصدار، ويظهر في «إعدادات المنصة» آخر إشعار صحيح.",
  "صفحة الدفع تقبل اللغة AR.",
  "طلب الاسترداد MakeRefund يُقبل ومعه الحقلان RefundChargeOnCustomer و SourceInfo.",
  "تاريخ الانتهاء ExpiryDate بلا فرق توقيت يُقبل، والرابط ينتهي فعلًا بعد ٦٠ دقيقة.",
  "رد GetRefundStatus على فاتورة لا استرداد عليها مسجَّل كما وصل.",
  "طريقة ظهور دفعة ناجحة ثانية على الفاتورة نفسها مسجَّلة.",
  "هل يعمل رابط ExecutePayment مرة واحدة فقط أم أكثر: مسجَّل.",
  "أقصى طول تقبله البوابة في ExternalIdentifier مسجَّل.",
] as const;

/** الترحيلات التي يحتاجها هذا الكود. اختبار الوحدة يفشل إذا أُضيف ترحيل بعد 0010 ولم يُذكر هنا */
export const REQUIRED_MIGRATIONS = ["0010_payments_hardening.sql", "0011_accounts_hardening.sql", "0012_content_teachers.sql", "0013_site_ops.sql", "0014_hardening.sql"] as const;

// ---------------------------------------------------------------------------
// الحقائق والتأشيرات
// ---------------------------------------------------------------------------

export type JobFact = { job: string; title: string; status: "ok" | "failed" | "late" | "never"; lastSuccessAt: Date | null };

export type SellerField = "legal_name" | "license_number" | "address" | "mail_provider";

/**
 * ما يعرفه النظام عن النشر الذي تُفتح منه الصفحة. null في قسم = تعذرت قراءته، فتظهر خطوته «تعذر الفحص».
 * لا يحمل هذا الشكل قيمة أي سر ولا طولها: وجود المفتاح فقط.
 */
export type LaunchFacts = {
  deployment: { vercelEnv: string | null };
  migrations: { applied: string[] } | null;
  /** APP_URL كما هو. لا يُعرض منه إلا النطاق */
  appUrl: string;
  indexing: { indexable: boolean; disabledBySetting: boolean };
  trustProxy: boolean;
  cronSecret: boolean;
  jobs: JobFact[] | null;
  reconcile: "daily" | "frequent";
  opsAlertEmail: boolean;
  /** مصير آخر رسالة تنبيه أو تجربة إلى البريد المضبوط الآن. null: تعذرت قراءة السجل */
  opsAlertDelivery: "sent" | "failed" | "logged" | "none" | null;
  mail: { driver: "log" | "smtp"; lastSentAt: Date | null; lastFailedAt: Date | null } | null;
  admins: { total: number; enrolled: number } | null;
  twoFactorRequired: boolean;
  payments: {
    mode: "disabled" | "sandbox" | "live";
    enabled: boolean;
    environment: "none" | "sandbox" | "live";
    /** سبب التعطيل بنص ثابت من الكود، ولا يحمل قيمة متغير */
    reason: string | null;
    apiKey: boolean;
    webhookSecret: boolean;
    liveConfirmed: boolean;
    baseUrlSet: boolean;
  };
  /** آخر إشعار موقّع صحيح، وآخر إشعار دفع واسترداد يخص فاتورة حقيقية (live)، وآخر نزاع */
  webhooks: { lastValidAt: Date | null; livePayment: Date | null; liveRefund: Date | null; dispute: Date | null; rejectedLast24h: number } | null;
  /** أثر الطلبات التجريبية الذي ينظفه أمر purge-test-orders */
  testOrders: { openOrders: number; openPayments: number; entitlements: number; redemptions: number } | null;
  settings: { feeRulesConfirmed: boolean; sellerMissing: SellerField[]; contactEmail: boolean; contactPhone: boolean; videosEnabled: boolean } | null;
  catalog: { published: number; stopped: number } | null;
  /** معلمون لهم محتوى يُباع الآن: منشور بنفسه أو داخل باقة منشورة، وليس مجانيًا */
  teachers: { selling: number; missingShare: number; missingAgreement: number; managedSelling: number } | null;
  content: { unchecked: number; flagged: number; badPreviews: number } | null;
  video: { provider: "file" | "bunny"; allowFileVideo: boolean; hostingBlocked: boolean; bunnyKeys: boolean; bunnyCdnHost: boolean };
};

export type LaunchTick = { done: boolean; version: string; changedAt: Date; changedBy: string | null };
/** null = تعذرت قراءة التأشيرات */
export type LaunchTicks = Partial<Record<ManualKey, LaunchTick>> | null;

// ---------------------------------------------------------------------------
// الخطوات
// ---------------------------------------------------------------------------

export type StepState = "done" | "open" | "na" | "unknown";
export type LaunchGroup = "hosting" | "legal" | "content" | "payments";

export const LAUNCH_GROUPS: { key: LaunchGroup; title: string; description: string }[] = [
  { key: "hosting", title: "الاستضافة والتشغيل", description: "الخطط المدفوعة، وإعدادات النشر، والبريد، والوظائف المجدولة، والنسخ الاحتياطي." },
  { key: "legal", title: "الهوية والقانون", description: "من يبيع، وكيف يتواصل معه المشتري، ومراجعة المحامي." },
  { key: "content", title: "المحتوى والمعلمون", description: "ما يُعرض للبيع، وسلامة ملفاته، وحقوق المعلمين، والفيديو." },
  { key: "payments", title: "الدفع", description: "آخر ما يُفعَّل: تجربة كاملة، ثم الدفع الحقيقي، ثم دفعة صغيرة منك." },
];

export type LaunchStep = {
  key: string;
  group: LaunchGroup;
  kind: "auto" | "manual";
  title: string;
  state: StepState;
  /** لازمة: الحكم لا يقول «جاهز» قبلها. الخطوة غير المطلوبة الآن ليست لازمة أبدًا */
  blocking: boolean;
  /** جملة واحدة بما يفعله المالك */
  todo: string;
  /** أين يفعله */
  where: { label: string; href?: string };
  /** ما رآه النظام أو ما تشمله الخطوة. نصوص آمنة فقط */
  facts: string[];
  checklist?: readonly string[];
  manual?: { key: ManualKey; tick: { at: Date; by: string | null } | null; stale: boolean };
  /**
   * خطوة لا تُنجز إلا والدفع الحقيقي مفعّل لكل الزوار (التفعيل نفسه، والدفعة الصغيرة، وإشعاراتها).
   * لا بوابة تقصر الدفع الحقيقي على المالك، فهذه خطوات اليوم الأول بعد التفعيل، لا شرطًا قبله
   */
  firstDay?: boolean;
};

export type LaunchVerdict = {
  /** كل خطوة لازمة منجزة، ومنها خطوات اليوم الأول: الدفع الحقيقي يعمل وتحقق */
  ready: boolean;
  /** كل خطوة لازمة قبل التفعيل منجزة: يجوز تفعيل الدفع الحقيقي الآن */
  readyToSwitchOn: boolean;
  /** خطوات اليوم الأول اللازمة المفتوحة */
  firstDayOpen: { key: string; title: string }[];
  beforeLiveTotal: number;
  beforeLiveDone: number;
  blockingTotal: number;
  blockingDone: number;
  /** الخطوات اللازمة المفتوحة أو التي تعذر فحصها، بترتيب الصفحة */
  blockingOpen: { key: string; title: string }[];
  optionalOpen: number;
  manualTotal: number;
  manualDone: number;
};

const ENV_WHERE = { label: "Vercel ← المشروع ← Settings ← Environment Variables ← Production، ثم إعادة النشر" };

const ALERT_DELIVERY_FACT = {
  sent: "قبل خادم البريد آخر رسالة تنبيه إلى هذا البريد. تأكد أنها وصلت ولم تذهب إلى الرسائل غير المرغوبة.",
  failed: "آخر رسالة تنبيه إلى هذا البريد لم تخرج: رفضها خادم البريد أو لم يرد. السبب في صفحة «البريد الصادر».",
  logged: "البريد في وضع السجل الداخلي، فآخر رسالة سُجلت ولم تخرج إلى أحد. فعّل SMTP ثم أرسل رسالة تجربة.",
  none: "لم تخرج بعد أي رسالة تنبيه إلى هذا البريد. أرسل رسالة تجربة من صفحة صحة المنصة.",
  unknown: "تعذرت قراءة سجل البريد، فلا نعرف إن كانت الرسائل تصل.",
} as const;
const SETTINGS_WHERE = { label: "إعدادات المنصة", href: "/admin/settings" };
const HEALTH_WHERE = { label: "سلامة المحتوى", href: "/admin/content-health" };
const UNKNOWN_FACT = "تعذرت قراءة هذه الحالة الآن، وسُجّل الخطأ في «صحة المنصة». أعد فتح الصفحة بعد قليل.";

const when = (d: Date | null, none = "لم يحدث بعد") => (d ? formatDateTime(d) : none);
const presence = (present: boolean) => (present ? "مضبوط" : "غير مضبوط");

export type AppUrlProblem = "invalid" | "local" | "ip" | "vercel" | "test_domain" | "not_https";

const APP_URL_PROBLEMS: Record<AppUrlProblem, string> = {
  invalid: "APP_URL ليس رابطًا صحيحًا.",
  local: "APP_URL يشير إلى جهاز محلي، وبوابة الدفع ترفض روابط localhost.",
  ip: "APP_URL عنوان رقمي، لا نطاق يعرفه الطلاب.",
  vercel: "APP_URL رابط vercel.app مؤقت، لا نطاق المنصة الحقيقي.",
  test_domain: "APP_URL نطاق تجريبي لا يصل إليه الطلاب.",
  not_https: "APP_URL لا يبدأ بـ https.",
};

/** هل APP_URL نطاق حقيقي يصلح لروابط الدفع والبريد؟ host بلا اسم مستخدم أو كلمة مرور أبدًا */
export function appUrlCheck(appUrl: string): { host: string; problem: AppUrlProblem | null } {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return { host: "", problem: "invalid" };
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host) || host === "[::1]" || host === "0.0.0.0") return { host: url.host, problem: "local" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return { host: url.host, problem: "ip" };
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return { host: url.host, problem: "vercel" };
  if (!host.includes(".") || /\.(test|example|invalid|local|internal)$/.test(host)) return { host: url.host, problem: "test_domain" };
  if (url.protocol !== "https:") return { host: url.host, problem: "not_https" };
  return { host: url.host, problem: null };
}

type Built = Omit<LaunchStep, "group" | "kind" | "manual"> & { manual?: LaunchStep["manual"] };

/** خطوة آلية: تعذرت القراءة = «تعذر الفحص» وتبقى لازمة إن كانت لازمة */
function unknownStep(base: Omit<Built, "state" | "facts">): Built {
  return { ...base, state: "unknown", facts: [UNKNOWN_FACT] };
}

function manualStep(
  key: ManualKey,
  ticks: LaunchTicks,
  base: { title: string; todo: string; where: Built["where"]; facts?: string[]; checklist?: readonly string[]; applicable?: { yes: boolean; whyNot: string } },
): Built {
  const facts = [...(base.facts ?? [])];
  if (base.applicable && !base.applicable.yes) {
    return { key, title: base.title, todo: base.todo, where: base.where, checklist: base.checklist, state: "na", blocking: false, facts: [base.applicable.whyNot, ...facts], manual: { key, tick: null, stale: false } };
  }
  if (ticks === null) {
    return { key, title: base.title, todo: base.todo, where: base.where, checklist: base.checklist, state: "unknown", blocking: true, facts: [UNKNOWN_FACT, ...facts], manual: { key, tick: null, stale: false } };
  }
  const tick = ticks[key];
  const current = Boolean(tick?.done && tick.version === MANUAL_VERSIONS[key]);
  const stale = Boolean(tick?.done && !current);
  if (stale) facts.unshift("أُشّر عليها لنسخة سابقة من هذه الخطوة، وتغيّر المطلوب بعدها. تأكد من جديد ثم أشّر.");
  return {
    key,
    title: base.title,
    todo: base.todo,
    where: base.where,
    checklist: base.checklist,
    state: current ? "done" : "open",
    blocking: true,
    facts,
    manual: { key, tick: tick?.done ? { at: tick.changedAt, by: tick.changedBy } : null, stale },
  };
}

// ---------------------------------------------------------------------------
// المجموعات
// ---------------------------------------------------------------------------

function hostingSteps(f: LaunchFacts, ticks: LaunchTicks): Built[] {
  const steps: Built[] = [];

  steps.push(
    manualStep("vercel_pro", ticks, {
      title: "خطة Vercel Pro",
      todo: "رقِّ فريق Vercel إلى خطة Pro، لأن خطة Hobby للاستخدام الشخصي غير التجاري فقط ولا تشغّل الوظائف المجدولة إلا مرة في اليوم.",
      where: { label: "Vercel ← Settings ← Billing" },
    }),
    manualStep("supabase_pro", ticks, {
      title: "خطة Supabase Pro",
      todo: "رقِّ مؤسسة Supabase إلى خطة Pro، لأن الخطة المجانية بلا نسخ احتياطية يومية، وPro تحفظ نسخ آخر ٧ أيام.",
      where: { label: "Supabase ← Organization ← Billing" },
    }),
  );

  const migrationsBase = { key: "migrations", title: "تحديثات قاعدة البيانات", blocking: true, todo: "اطلب من المطور تشغيل أمر الترحيل npm run db:migrate على قاعدة بيانات الإنتاج.", where: { label: "قاعدة بيانات Supabase للإنتاج، من جهاز المطور" } };
  if (!f.migrations) steps.push(unknownStep(migrationsBase));
  else {
    const missing = REQUIRED_MIGRATIONS.filter((name) => !f.migrations!.applied.includes(name));
    steps.push({
      ...migrationsBase,
      state: missing.length === 0 ? "done" : "open",
      facts: missing.length === 0 ? [`التحديثات من ${REQUIRED_MIGRATIONS[0].slice(0, 4)} إلى ${REQUIRED_MIGRATIONS[REQUIRED_MIGRATIONS.length - 1].slice(0, 4)} مطبقة كلها.`] : [`لم يُطبق بعد: ${missing.join("، ")}`],
    });
  }

  const url = appUrlCheck(f.appUrl);
  steps.push({
    key: "app_url",
    title: "نطاق الموقع الحقيقي (APP_URL)",
    state: url.problem ? "open" : "done",
    blocking: true,
    todo: "اضبط APP_URL على نطاق المنصة الحقيقي بـ https، وهو العنوان نفسه الذي يفتحه الطلاب (بـ www أو بدونها)، ثم أعد النشر.",
    where: ENV_WHERE,
    facts: [url.host ? `النطاق الحالي: ${url.host}` : "APP_URL غير صالح.", ...(url.problem ? [APP_URL_PROBLEMS[url.problem]] : ["روابط الدفع والبريد تعود إلى هذا النطاق، والطالب الذي يفتح نطاقًا آخر يعود من الدفع غير مسجل الدخول."])],
  });

  steps.push({
    key: "indexing",
    title: "ظهور الموقع في محركات البحث",
    state: f.indexing.indexable ? "done" : "open",
    blocking: false,
    todo: f.indexing.disabledBySetting ? "احذف SITE_INDEXABLE أو اضبطه على true بعد ربط النطاق الحقيقي، ثم أعد النشر." : "يُفتح للبحث وحده بعد ضبط APP_URL على النطاق الحقيقي.",
    where: ENV_WHERE,
    facts: [f.indexing.indexable ? "محركات البحث تستطيع فهرسة الموقع." : f.indexing.disabledBySetting ? "الموقع مخفي عن محركات البحث لأن قيمة SITE_INDEXABLE ليست true." : "الموقع مخفي عن محركات البحث لأن عنوانه vercel.app."],
  });

  const onVercel = f.deployment.vercelEnv !== null;
  steps.push({
    key: "trust_proxy",
    title: "عنوان الزائر الحقيقي (TRUST_PROXY)",
    state: !onVercel ? "na" : f.trustProxy ? "done" : "open",
    blocking: onVercel,
    todo: "احذف TRUST_PROXY أو اضبطه على true على Vercel، ثم أعد النشر، وإلا عُدّ كل الزوار عنوانًا واحدًا في حدود المحاولات.",
    where: ENV_WHERE,
    facts: [onVercel ? `TRUST_PROXY ${f.trustProxy ? "مفعّل" : "معطّل"} على هذا النشر.` : "هذا النشر ليس على Vercel، فتأكد مع المطور أن الخادم خلف وكيل موثوق قبل تفعيله."],
  });

  const twoFactorBase = {
    key: "owner_2fa",
    title: "التحقق بخطوتين لحسابات الإدارة",
    blocking: true,
    todo: f.twoFactorRequired ? "اطلب من كل حساب إدارة تفعيل التحقق بخطوتين من صفحة «أمان الحساب» في حسابه." : "احذف ADMIN_2FA_REQUIRED=false من بيئة Production، ثم أعد النشر.",
    where: f.twoFactorRequired ? { label: "أمان الحساب", href: "/admin/security" } : ENV_WHERE,
  };
  if (!f.admins) steps.push(unknownStep(twoFactorBase));
  else {
    const all = f.admins.total > 0 && f.admins.enrolled === f.admins.total;
    steps.push({
      ...twoFactorBase,
      state: f.twoFactorRequired && all ? "done" : "open",
      facts: [`حسابات الإدارة التي فعّلت التحقق بخطوتين: ${ar(f.admins.enrolled)} من ${ar(f.admins.total)}`,f.twoFactorRequired ? "التحقق بخطوتين إلزامي على هذا النشر." : "التحقق بخطوتين غير إلزامي على هذا النشر لأن ADMIN_2FA_REQUIRED=false."],
    });
  }

  const mailBase = { key: "mail", title: "البريد الحقيقي (SMTP)", blocking: true };
  if (!f.mail) steps.push(unknownStep({ ...mailBase, todo: "أعد فتح الصفحة بعد قليل.", where: { label: "البريد الصادر", href: "/admin/mail" } }));
  else {
    const m = f.mail;
    const lastWasFailure = m.lastFailedAt !== null && (m.lastSentAt === null || m.lastFailedAt > m.lastSentAt);
    const ok = m.driver === "smtp" && m.lastSentAt !== null && !lastWasFailure;
    steps.push({
      ...mailBase,
      state: ok ? "done" : "open",
      todo:
        m.driver === "log"
          ? "اضبط MAIL_DRIVER=smtp مع بيانات خادم البريد و MAIL_FROM من نطاقك، ثم أعد النشر وأرسل رسالة تجربة."
          : lastWasFailure
            ? "آخر رسالة فشل إرسالها: راجع سببها في «البريد الصادر» وصحح بيانات خادم البريد."
            : "أرسل رسالة تجربة، مثل رابط تأكيد البريد لحساب طالب تجريبي، وتأكد أنها وصلت.",
      where: m.driver === "log" ? ENV_WHERE : { label: "البريد الصادر", href: "/admin/mail" },
      facts: [
        m.driver === "smtp" ? "المشغل: SMTP، إرسال حقيقي." : "المشغل: سجل داخلي، لا تصل أي رسالة إلى أحد ولا يُطلب تأكيد البريد.",
        `آخر إرسال ناجح: ${when(m.lastSentAt)}`,
        `آخر فشل: ${when(m.lastFailedAt, "لا يوجد")}`,
      ],
    });
  }

  steps.push({
    key: "ops_alert_email",
    title: "بريد تنبيهات المالك (OPS_ALERT_EMAIL)",
    // العنوان وحده لا يثبت أن الرسائل تصل: لا تُنجز الخطوة إلا بعد رسالة قبلها خادم البريد إلى هذا العنوان
    state: !f.opsAlertEmail ? "open" : f.opsAlertDelivery === null ? "unknown" : f.opsAlertDelivery === "sent" ? "done" : "open",
    blocking: true,
    todo: "أضف OPS_ALERT_EMAIL ببريدك الحقيقي وأعد النشر، ثم اضغط «أرسل رسالة تجربة» في صفحة صحة المنصة وتأكد أنها وصلتك، حتى تصلك رسالة عند نزاع أو دفعة زائدة أو وظيفة متوقفة.",
    where: { label: `${ENV_WHERE.label}، ثم صحة المنصة ← أرسل رسالة تجربة`, href: "/admin/ops#test-alert" },
    facts: [f.opsAlertEmail ? "مضبوط ببريد صالح." : "غير مضبوط أو ليس بريدًا صالحًا.", ...(f.opsAlertEmail ? [ALERT_DELIVERY_FACT[f.opsAlertDelivery ?? "unknown"]] : [])],
  });

  steps.push({
    key: "cron_secret",
    title: "سر الوظائف المجدولة (CRON_SECRET)",
    state: f.cronSecret ? "done" : "open",
    blocking: true,
    todo: "أضف CRON_SECRET بقيمة عشوائية من ١٦ حرفًا على الأقل من حروف وأرقام، ثم أعد النشر.",
    where: ENV_WHERE,
    facts: [f.cronSecret ? "مضبوط." : "غير مضبوط أو قصير، فتُرفض كل وظيفة مجدولة."],
  });

  const jobsBase = {
    key: "jobs",
    title: "الوظائف المجدولة الثلاث",
    blocking: true,
    todo: "تعمل الوظائف على نشر Production فقط، وبعضها مرة في اليوم، فانتظر يومًا بعد ضبط CRON_SECRET وإعادة النشر، ثم تأكد أن الثلاث نجحت.",
    where: { label: "صحة المنصة، وسجلها في Vercel ← Schedules ← Cron Jobs", href: "/admin/ops" },
  };
  if (!f.jobs) steps.push(unknownStep(jobsBase));
  else {
    const label = { ok: "تعمل", failed: "فشلت آخر مرة", late: "متأخرة عن موعدها", never: "لم تعمل بعد" } as const;
    steps.push({
      ...jobsBase,
      state: f.jobs.length > 0 && f.jobs.every((job) => job.status === "ok") ? "done" : "open",
      facts: f.jobs.map((job) => `${job.title}: ${label[job.status]}، آخر نجاح ${when(job.lastSuccessAt)}`),
    });
  }

  const health = appUrlCheck(f.appUrl);
  steps.push(
    manualStep("uptime_monitor", ticks, {
      title: "مراقب خارجي للموقع",
      todo: "أنشئ حسابًا مجانيًا في UptimeRobot، وأضف مراقب HTTP(s) على رابط الفحص أدناه بفاصل ٥ دقائق وتنبيه إلى بريدك، ثم أشّر.",
      where: { label: "uptimerobot.com ← Add New Monitor" },
      facts: [
        `رابط الفحص: https://${health.problem === "invalid" || !health.host ? "<نطاقك>" : health.host}/api/health`,
        "بدونه لا تصلك رسالة إن توقف الموقع أو قاعدة البيانات، ورسالة توقف الوظائف المجدولة كلها لا تصل حتى تفتح لوحة الإدارة.",
      ],
    }),
  );

  steps.push(
    manualStep("restore_drill", ticks, {
      title: "تجربة استعادة النسخة الاحتياطية",
      todo: "اطلب من المطور استعادة نسخة قاعدة البيانات والملفات إلى مشروع تجريبي منفصل، والتأكد أن الموقع يعمل منها.",
      where: { label: "README ← النسخ الاحتياطي والاستعادة" },
    }),
  );
  return steps;
}

function legalSteps(f: LaunchFacts, ticks: LaunchTicks): Built[] {
  const steps: Built[] = [];
  const sellerLabels: Record<SellerField, string> = { legal_name: "الاسم النظامي", license_number: "رقم الرخصة التجارية", address: "العنوان", mail_provider: "اسم مزود البريد" };
  const sellerBase = { key: "seller_identity", title: "هوية البائع", blocking: true, todo: "أدخل الاسم النظامي ورقم الرخصة التجارية والعنوان واسم مزود البريد في «إعدادات المنصة».", where: SETTINGS_WHERE };
  const contactBase = { key: "contact", title: "وسائل التواصل", blocking: true, todo: "أدخل بريد التواصل ورقم هاتف أو واتساب في «إعدادات المنصة».", where: SETTINGS_WHERE };
  if (!f.settings) steps.push(unknownStep(sellerBase), unknownStep(contactBase));
  else {
    const s = f.settings;
    steps.push({
      ...sellerBase,
      state: s.sellerMissing.length === 0 ? "done" : "open",
      facts: s.sellerMissing.length === 0 ? ["كلها مدخلة، وتظهر في تذييل الموقع والصفحات القانونية."] : [`ناقص: ${s.sellerMissing.map((field) => sellerLabels[field]).join("، ")}`],
    });
    steps.push({
      ...contactBase,
      state: s.contactEmail && s.contactPhone ? "done" : "open",
      facts: [`بريد التواصل: ${s.contactEmail ? "مدخل" : "ناقص"}`, `هاتف أو واتساب: ${s.contactPhone ? "مدخل" : "ناقص"}`],
    });
  }
  steps.push(
    manualStep("commercial_license", ticks, {
      title: "الرخصة التجارية",
      todo: "استخرج الرخصة التجارية لنشاط المنصة، وأدخل رقمها في «إعدادات المنصة».",
      where: { label: "وزارة التجارة والصناعة، ثم «إعدادات المنصة»", href: "/admin/settings" },
    }),
    manualStep("lawyer_review", ticks, {
      title: "مراجعة المحامي للصفحات القانونية",
      todo: "اطلب من محامٍ مراجعة الشروط والخصوصية وسياسة الاسترداد وحقوق النشر وإقرار ولي الأمر واتفاقية المعلم، وطبّق ملاحظاته قبل التأشير.",
      where: { label: "صفحات الموقع /terms و /privacy و /refund-policy و /copyright، واتفاقية المعلم في لوحته" },
      facts: [
        `النسخ الحالية: الشروط ${CONSENT_VERSIONS.terms}، الخصوصية ${CONSENT_VERSIONS.privacy}، إقرار ولي الأمر عند الدفع ${CONSENT_VERSIONS.guardian_purchase}، وعند إنشاء الحساب ${CONSENT_VERSIONS.guardian_account}، اتفاقية المعلم ${CONSENT_VERSIONS.teacher_agreement}.`,
        "تعود هذه الخطوة مفتوحة وحدها إذا تغيرت نسخة أي من هذه الوثائق في المنصة.",
      ],
    }),
  );
  return steps;
}

function contentSteps(f: LaunchFacts, ticks: LaunchTicks): Built[] {
  const steps: Built[] = [];

  const catalogBase = { key: "catalog", title: "محتوى منشور يُباع", blocking: true, todo: "انشر منتجًا واحدًا على الأقل بسعر وملف سليم من «المحتوى والمنتجات».", where: { label: "المحتوى والمنتجات", href: "/admin/products" } };
  if (!f.catalog) steps.push(unknownStep(catalogBase));
  else {
    const sellable = f.catalog.published - f.catalog.stopped;
    steps.push({ ...catalogBase, state: sellable > 0 ? "done" : "open", facts: [`المنتجات المنشورة: ${ar(f.catalog.published)}، ويُباع منها الآن: ${ar(Math.max(sellable, 0))}`] });
  }

  const scannedBase = { key: "files_scanned", title: "فحص كل الملفات", blocking: true, todo: "اضغط «فحص الدفعة التالية» في «سلامة المحتوى» حتى لا يبقى ملف لم يُفحص.", where: HEALTH_WHERE };
  const flaggedBase = { key: "flagged_files", title: "ملفات معيبة", blocking: false, todo: "استبدل كل ملف معيب بنسخة سليمة، أو أعد فحصه إن ظهر بعد عطل عابر في التخزين.", where: HEALTH_WHERE };
  const previewsBase = { key: "previews", title: "معاينات تنتظر الإصلاح", blocking: false, todo: "اضغط «إعادة توليد الكل» في «سلامة المحتوى».", where: HEALTH_WHERE };
  if (!f.content) steps.push(unknownStep(scannedBase), unknownStep(flaggedBase), unknownStep(previewsBase));
  else {
    const c = f.content;
    steps.push({ ...scannedBase, state: c.unchecked === 0 ? "done" : "open", facts: [c.unchecked === 0 ? "كل الملفات فُحصت." : `ملفات لم تُفحص بعد: ${ar(c.unchecked)}، وقد يصل إلى مشترٍ ملف لا يفتح.`] });
    steps.push({ ...flaggedBase, state: c.flagged === 0 ? "done" : "open", facts: [c.flagged === 0 ? "لا يوجد ملف معيب." : `ملفات معيبة: ${ar(c.flagged)}. المنتج الذي ملفه الرئيسي معيب لا يُباع حتى يُصلح.`] });
    steps.push({ ...previewsBase, state: c.badPreviews === 0 ? "done" : "open", facts: [c.badPreviews === 0 ? "كل المعاينات سليمة." : `معاينات لا تظهر للطلاب حتى تُصلح: ${ar(c.badPreviews)}`] });
  }

  const stoppedBase = {
    key: "stopped_products",
    title: "منتجات منشورة متوقفة عن البيع",
    blocking: false,
    todo: "أصلح سبب التوقف لكل منتج: سعر صفر، أو معلم بلا نسبة، أو رسوم غير معتمدة، أو ملف معيب، أو فيديو مغلق، أو تاريخ إتاحة انتهى.",
    where: HEALTH_WHERE,
  };
  if (!f.catalog) steps.push(unknownStep(stoppedBase));
  else steps.push({ ...stoppedBase, state: f.catalog.stopped === 0 ? "done" : "open", facts: [f.catalog.stopped === 0 ? "كل المنشور يُباع." : `منتجات منشورة لا تُباع الآن: ${ar(f.catalog.stopped)}، ولا يظهر لها سعر ولا زر شراء.`] });

  const teachersBase = { key: "teachers", title: "نسبة المعلمين واتفاقيتهم", todo: "حدد نسبة كل معلم في «المعلمون»، واطلب من كل معلم له حساب قبول الاتفاقية من لوحته.", where: { label: "المعلمون", href: "/admin/teachers" } };
  if (!f.teachers) steps.push(unknownStep({ ...teachersBase, blocking: true }));
  else {
    const t = f.teachers;
    const facts =
      t.selling === 0
        ? ["لا يوجد معلم له محتوى يُباع الآن، فلا حاجة لهذه الخطوة."]
        : [
            `معلمون لهم محتوى يُباع: ${ar(t.selling)}`,
            `بلا نسبة: ${ar(t.missingShare)}، ولم يقبلوا الاتفاقية الحالية: ${ar(t.missingAgreement)}`,
            ...(t.managedSelling > 0 ? ["المعلم الذي تديره أنت بلا حساب لا يقبل الاتفاقية داخل المنصة، فاحتفظ باتفاق موقّع معه."] : []),
          ];
    steps.push({ ...teachersBase, state: t.selling === 0 ? "na" : t.missingShare === 0 && t.missingAgreement === 0 ? "done" : "open", blocking: t.selling > 0, facts });
  }

  const v = f.video;
  const videosEnabled = f.settings?.videosEnabled ?? null;
  const rawOpen = v.provider === "file" && !v.hostingBlocked && videosEnabled !== false;
  const bunnySold = v.provider === "bunny" && videosEnabled !== false;
  steps.push({
    key: "video",
    title: "الفيديو",
    state: rawOpen ? "open" : bunnySold && !v.bunnyKeys ? "open" : "done",
    blocking: bunnySold && !v.bunnyKeys,
    todo: rawOpen
      ? "انقل الفيديو إلى Bunny Stream، أو احذف ALLOW_FILE_VIDEO لإغلاقه، ثم أعد النشر."
      : bunnySold
        ? "أكمل خطوات Bunny الثلاث التالية قبل بيع أول درس."
        : "لا شيء الآن. قبل بيع الفيديو انقله إلى Bunny Stream كما في README.",
    where: rawOpen || (bunnySold && !v.bunnyKeys) ? ENV_WHERE : { label: "README ← الفيديو" },
    facts: [
      v.provider === "bunny" ? "المزود: Bunny Stream." : "المزود: ملفات على تخزين المنصة.",
      v.hostingBlocked
        ? "الإطلاق بالمذكرات فقط: الفيديو مغلق لأن ملفه الخام يمكن تنزيله."
        : rawOpen
          ? v.allowFileVideo
            ? "الفيديو يُباع كملف خام يستطيع الطالب تنزيله، لأن ALLOW_FILE_VIDEO=true."
            : "الفيديو يُباع كملف خام يستطيع الطالب تنزيله، لأن هذا النشر ليس نشر إنتاج (NODE_ENV)."
          : videosEnabled === false
            ? "الفيديو موقوف من «إعدادات المنصة»."
            : "الفيديو مفتوح للبيع.",
      ...(v.provider === "bunny" ? [`مفاتيح Bunny: ${v.bunnyKeys ? "مضبوطة" : "ناقصة"}، ونطاق CDN: ${presence(v.bunnyCdnHost)}`] : []),
    ],
  });

  const notBunny = { yes: bunnySold, whyNot: "الفيديو لا يُباع عبر Bunny الآن، فلا حاجة لهذه الخطوة." };
  steps.push(
    manualStep("bunny_cdn_token", ticks, {
      title: "توقيع روابط Bunny (CDN token authentication)",
      todo: "فعّل CDN token authentication في إعدادات Security لمكتبة الفيديو، وتأكد أن رابط بث بلا توقيع يُرفض.",
      where: { label: "Bunny ← Stream ← مكتبة الفيديو ← Security" },
      applicable: notBunny,
    }),
    manualStep("bunny_mp4_off", ticks, {
      title: "إيقاف MP4 Fallback في Bunny",
      todo: "أبقِ MP4 Fallback مغلقًا في إعدادات Encoding لمكتبة الفيديو، حتى لا يوجد ملف كامل قابل للتنزيل.",
      where: { label: "Bunny ← Stream ← مكتبة الفيديو ← Encoding" },
      applicable: notBunny,
    }),
    manualStep("bunny_real_test", ticks, {
      title: "رفع ومشاهدة حقيقية على Bunny",
      todo: "ارفع درسًا حقيقيًا، وانتظر حتى يصبح جاهزًا بإشعار Bunny، ثم شاهده من حساب طالب اشتراه.",
      where: { label: "المحتوى والمنتجات، ثم حساب طالب", href: "/admin/products" },
      applicable: notBunny,
    }),
  );
  return steps;
}

function paymentSteps(f: LaunchFacts, ticks: LaunchTicks): Built[] {
  const steps: Built[] = [];
  const p = f.payments;
  const appOrigin = (() => {
    try {
      return new URL(f.appUrl).origin;
    } catch {
      return null;
    }
  })();

  steps.push(
    manualStep("sandbox_pass", ticks, {
      title: "تجربة كاملة في بيئة الاختبار الحقيقية",
      todo: "اطلب من المطور تجربة كاملة على نشر منفصل بقاعدة بيانات منفصلة وحساب MyFatoorah التجريبي، وتأكيد كل بند أدناه، ثم أشّر.",
      where: { label: "نشر تجريبي منفصل، كما في README ← بيئة الاختبار (Sandbox)" },
      checklist: SANDBOX_PASS_CHECKS,
    }),
  );

  const feeBase = { key: "fee_rules", title: "اعتماد رسوم الدفع", todo: "اعتمد الرسوم من «إعدادات المنصة» ولو كانت صفرًا، فبدونها لا يُباع محتوى أي معلم.", where: SETTINGS_WHERE };
  if (!f.settings) steps.push(unknownStep({ ...feeBase, blocking: true }));
  else {
    const teacherContent = f.teachers === null || f.teachers.selling > 0;
    steps.push({
      ...feeBase,
      state: f.settings.feeRulesConfirmed ? "done" : "open",
      blocking: teacherContent,
      facts: [f.settings.feeRulesConfirmed ? "الرسوم معتمدة." : teacherContent ? "الرسوم غير معتمدة، فمحتوى المعلمين متوقف عن البيع." : "الرسوم غير معتمدة، ولا محتوى معلمين يُباع الآن."],
    });
  }

  const testBase = {
    key: "test_orders",
    title: "تنظيف الطلبات التجريبية",
    blocking: true,
    todo: "اطلب من المطور تشغيل أمر تنظيف الطلبات التجريبية npm run payments:purge-test-orders على قاعدة الإنتاج قبل الدفع الحقيقي.",
    where: { label: "README ← إعداد بوابة الدفع ← قبل التحول إلى الإنتاج" },
  };
  if (!f.testOrders) steps.push(unknownStep(testBase));
  else {
    const t = f.testOrders;
    const clean = t.openOrders + t.openPayments + t.entitlements + t.redemptions === 0;
    const left = [
      ...(t.openOrders > 0 ? [`طلبات تجريبية مفتوحة: ${ar(t.openOrders)}`] : []),
      ...(t.openPayments > 0 ? [`محاولات دفع مفتوحة على طلبات تجريبية: ${ar(t.openPayments)}`] : []),
      ...(t.entitlements > 0 ? [`صلاحيات من طلبات تجريبية ما زالت تفتح المحتوى: ${ar(t.entitlements)}`] : []),
      ...(t.redemptions > 0 ? [`استخدامات كوبونات من طلبات تجريبية ما زالت تُحسب من حدودها: ${ar(t.redemptions)}`] : []),
    ];
    steps.push({ ...testBase, state: clean ? "done" : "open", facts: clean ? ["لا يبقى أثر لطلب تجريبي: لا طلب مفتوح ولا صلاحية ولا استخدام كوبون."] : left });
  }

  steps.push(
    manualStep("portal_webhook", ticks, {
      title: "إعداد Webhook في لوحة MyFatoorah",
      todo: "في لوحة الإنتاج فعّل Webhook بالإصدار V2 والأحداث الثلاثة ومفتاح التوقيع، وإعادة المحاولة ٥ مرات بتأخير ١٨٠ ثانية.",
      where: { label: "portal.myfatoorah.com ← Integration Settings ← Webhook Settings" },
      facts: [
        "الأحداث: Payment Status Changed و Refund Status Changed و Dispute Status Changed.",
        ...(appOrigin ? [`الرابط الذي يُكتب في اللوحة: ${appOrigin}/api/payments/myfatoorah/webhook`] : []),
      ],
    }),
  );

  const modeLabel = { disabled: "معطّل", sandbox: "تجريبي (Sandbox)", live: "حقيقي (Live)" }[p.mode];
  const liveOn = p.enabled && p.environment === "live";
  steps.push({
    key: "payment_mode",
    title: "الدفع الحقيقي (PAYMENTS_MODE=live)",
    state: liveOn ? "done" : "open",
    blocking: true,
    firstDay: true,
    todo:
      p.mode === "live" && !p.enabled
        ? "صحح ما يمنع التفعيل كما في السبب أدناه، ثم أعد النشر."
        : "بعد اجتياز التجربة اضبط PAYMENTS_MODE=live ومفتاح الإنتاج MYFATOORAH_API_KEY و MYFATOORAH_LIVE_CONFIRMED=true، ثم أعد النشر.",
    where: ENV_WHERE,
    facts: [
      `الوضع المضبوط: ${modeLabel}${p.mode !== "disabled" && !p.enabled ? "، ومعطّل فعليًا" : ""}`,
      ...(p.mode !== "disabled" && !p.enabled && p.reason ? [`سبب التعطيل: ${p.reason}`] : []),
      `مفتاح API: ${presence(p.apiKey)}`,
      `تأكيد الإنتاج (MYFATOORAH_LIVE_CONFIRMED): ${p.liveConfirmed ? "true" : "غير مضبوط"}`,
      ...(p.baseUrlSet ? ["MYFATOORAH_BASE_URL مضبوط يدويًا. في الإنتاج احذفه ليُستخدم الرابط الرسمي."] : []),
    ],
  });

  steps.push({
    key: "webhook_secret",
    title: "مفتاح توقيع إشعارات البوابة",
    state: p.webhookSecret ? "done" : "open",
    blocking: true,
    todo: "انسخ Webhook Secret Key من لوحة MyFatoorah للإنتاج إلى MYFATOORAH_WEBHOOK_SECRET، ثم أعد النشر.",
    where: ENV_WHERE,
    facts: [`MYFATOORAH_WEBHOOK_SECRET: ${presence(p.webhookSecret)}`],
  });

  steps.push({
    key: "reconcile_cadence",
    title: "تسوية المدفوعات كل ١٠ دقائق",
    state: f.reconcile === "frequent" ? "done" : "open",
    blocking: true,
    todo: "بعد الترقية إلى Vercel Pro اطلب من المطور تغيير جدول التسوية في vercel.json إلى كل ١٠ دقائق، ثم النشر.",
    where: { label: "ملف vercel.json، كما في README ← الوظائف المجدولة" },
    facts: [f.reconcile === "frequent" ? "التسوية تعمل كل بضع دقائق." : "التسوية مرة يوميًا: الدفعة التي ضاع إشعارها تُطبق حين يعود صاحبها إلى الموقع، ومن لا يعود ينتظر حتى اليوم التالي."],
  });

  const hooksBase = {
    key: "webhooks_received",
    title: "وصول إشعارات البوابة",
    blocking: true,
    firstDay: true,
    todo: "بعد الدفعة الحقيقية الصغيرة واستردادها تأكد أن إشعاري الدفع والاسترداد وصلا هنا، وإلا راجع إعداد Webhook ومفتاحه.",
    where: { label: "إعدادات المنصة ← بوابة الدفع", href: "/admin/settings" },
  };
  if (!f.webhooks) steps.push(unknownStep(hooksBase));
  else {
    const h = f.webhooks;
    steps.push({
      ...hooksBase,
      state: h.livePayment && h.liveRefund ? "done" : "open",
      facts: [
        `آخر إشعار صحيح من البوابة: ${when(h.lastValidAt, "لم يصل بعد")}`,
        `إشعار دفع حقيقي: ${when(h.livePayment, "لم يصل بعد")}`,
        `إشعار استرداد حقيقي: ${when(h.liveRefund, "لم يصل بعد")}`,
        `إشعار نزاع: ${when(h.dispute, "لم يصل، وهذا طبيعي ما لم يحدث نزاع")}`,
        ...(h.rejectedLast24h > 0 ? [`إشعارات مرفوضة خلال آخر ٢٤ ساعة: ${ar(h.rejectedLast24h)}`] : []),
      ],
    });
  }

  steps.push({
    ...manualStep("live_payment", ticks, {
      title: "دفعة حقيقية صغيرة واستردادها",
      todo: "فور تفعيل الدفع الحقيقي اشترِ أرخص منتج ببطاقتك، وتأكد أن الطلب مدفوع والمحتوى فُتح، ثم استرده في اليوم التالي وتأكد أن الاسترداد اكتمل.",
      where: { label: "الموقع نفسه، ثم «الطلبات والمدفوعات»", href: "/admin/orders" },
    }),
    firstDay: true,
  });
  return steps;
}

// ---------------------------------------------------------------------------
// التقييم
// ---------------------------------------------------------------------------

/** كل خطوات الإطلاق بترتيب الصفحة */
export function launchSteps(facts: LaunchFacts, ticks: LaunchTicks): LaunchStep[] {
  const groups: [LaunchGroup, Built[]][] = [
    ["hosting", hostingSteps(facts, ticks)],
    ["legal", legalSteps(facts, ticks)],
    ["content", contentSteps(facts, ticks)],
    ["payments", paymentSteps(facts, ticks)],
  ];
  return groups.flatMap(([group, built]) =>
    built.map((step): LaunchStep => ({
      ...step,
      group,
      kind: step.manual ? "manual" : "auto",
      // ما ليس مطلوبًا الآن لا يمنع الإطلاق، وما تعذر فحصه يبقى على لزومه
      blocking: step.state === "na" ? false : step.blocking,
    })),
  );
}

/** الحكم العام: «جاهز» فقط إذا كانت كل خطوة لازمة منجزة فعلًا */
export function launchVerdict(steps: LaunchStep[]): LaunchVerdict {
  const blocking = steps.filter((step) => step.blocking);
  const open = blocking.filter((step) => step.state !== "done");
  const blockingOpen = open.map((step) => ({ key: step.key, title: step.title }));
  const manual = steps.filter((step) => step.kind === "manual" && step.state !== "na");
  return {
    ready: blocking.length > 0 && blockingOpen.length === 0,
    readyToSwitchOn: blocking.some((step) => !step.firstDay) && open.every((step) => step.firstDay),
    firstDayOpen: open.filter((step) => step.firstDay).map((step) => ({ key: step.key, title: step.title })),
    beforeLiveTotal: blocking.filter((step) => !step.firstDay).length,
    beforeLiveDone: blocking.filter((step) => !step.firstDay && step.state === "done").length,
    blockingTotal: blocking.length,
    blockingDone: blocking.length - blockingOpen.length,
    blockingOpen,
    optionalOpen: steps.filter((step) => !step.blocking && step.state === "open").length,
    manualTotal: manual.length,
    manualDone: manual.filter((step) => step.state === "done").length,
  };
}
