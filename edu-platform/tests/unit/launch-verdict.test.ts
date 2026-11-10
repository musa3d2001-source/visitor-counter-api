import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSIONS } from "@/lib/consent";
import { MANUAL_KEYS, MANUAL_VERSIONS, REQUIRED_MIGRATIONS, appUrlCheck, isManualKey, launchSteps, launchVerdict, type LaunchFacts, type LaunchStep, type LaunchTicks, type ManualKey } from "@/lib/launch";

/**
 * حكم صفحة الإطلاق: لا يقول «جاهزة» ما دامت خطوة لازمة واحدة مفتوحة أو تعذر فحصها.
 * نبدأ من نشر مكتمل تمامًا، ثم نكسر كل شرط وحده ونتأكد أن الحكم ينقلب وأن الخطوة الصحيحة هي المفتوحة.
 */
const at = (iso: string) => new Date(iso);

function perfectFacts(): LaunchFacts {
  return {
    deployment: { vercelEnv: "production" },
    migrations: { applied: [...REQUIRED_MIGRATIONS] },
    appUrl: "https://www.farqad-edu.com",
    indexing: { indexable: true, disabledBySetting: false },
    trustProxy: true,
    cronSecret: true,
    jobs: [
      { job: "reconcile-payments", title: "تسوية المدفوعات", status: "ok", lastSuccessAt: at("2026-11-09T10:00:00Z") },
      { job: "expire-orders", title: "إغلاق الطلبات المنتهية", status: "ok", lastSuccessAt: at("2026-11-09T01:00:00Z") },
      { job: "prune-data", title: "تنظيف البيانات القديمة", status: "ok", lastSuccessAt: at("2026-11-09T02:00:00Z") },
    ],
    reconcile: "frequent",
    opsAlertEmail: true,
    mail: { driver: "smtp", lastSentAt: at("2026-11-09T09:00:00Z"), lastFailedAt: at("2026-11-01T09:00:00Z") },
    admins: { total: 1, enrolled: 1 },
    twoFactorRequired: true,
    payments: { mode: "live", enabled: true, environment: "live", reason: null, apiKey: true, webhookSecret: true, liveConfirmed: true, baseUrlSet: false },
    webhooks: { lastValidAt: at("2026-11-09T08:00:00Z"), livePayment: at("2026-11-08T08:00:00Z"), liveRefund: at("2026-11-09T08:00:00Z"), dispute: null, rejectedLast24h: 0 },
    testOrders: { openOrders: 0, openPayments: 0, entitlements: 0, redemptions: 0 },
    settings: { feeRulesConfirmed: true, sellerMissing: [], contactEmail: true, contactPhone: true, videosEnabled: true },
    catalog: { published: 5, stopped: 0 },
    teachers: { selling: 2, missingShare: 0, missingAgreement: 0, managedSelling: 1 },
    content: { unchecked: 0, flagged: 0, badPreviews: 0 },
    video: { provider: "bunny", allowFileVideo: false, hostingBlocked: false, bunnyKeys: true, bunnyCdnHost: true },
  };
}

function allTicked(): Partial<Record<ManualKey, { done: boolean; version: string; changedAt: Date; changedBy: string | null }>> {
  return Object.fromEntries(MANUAL_KEYS.map((key) => [key, { done: true, version: MANUAL_VERSIONS[key], changedAt: at("2026-11-09T12:00:00Z"), changedBy: "المالك" }]));
}

function evaluate(patch: (f: LaunchFacts) => void = () => {}, ticks: LaunchTicks = allTicked()) {
  const facts = perfectFacts();
  patch(facts);
  const steps = launchSteps(facts, ticks);
  return { steps, verdict: launchVerdict(steps), step: (key: string) => steps.find((s) => s.key === key)! };
}

describe("a complete deployment", () => {
  it("is ready, with every step done", () => {
    const { steps, verdict } = evaluate();
    expect(verdict.ready).toBe(true);
    expect(verdict.blockingOpen).toEqual([]);
    expect(steps.filter((s) => s.state !== "done").map((s) => s.key)).toEqual([]);
    expect(verdict.manualDone).toBe(verdict.manualTotal);
  });

  it("covers every manual step and every automatic check the owner asked for", () => {
    const keys = evaluate().steps.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of MANUAL_KEYS) expect(keys).toContain(key);
    for (const key of ["migrations", "app_url", "indexing", "trust_proxy", "owner_2fa", "mail", "ops_alert_email", "cron_secret", "jobs", "seller_identity", "contact", "catalog", "files_scanned", "flagged_files", "previews", "stopped_products", "teachers", "video", "fee_rules", "test_orders", "payment_mode", "webhook_secret", "reconcile_cadence", "webhooks_received"]) {
      expect(keys).toContain(key);
    }
  });

  it("asks for an outside monitor on this site's health address, because nothing inside notices a full stop", () => {
    const { step } = evaluate();
    expect(step("uptime_monitor")).toMatchObject({ group: "hosting", kind: "manual", blocking: true });
    expect(step("uptime_monitor").facts.join(" ")).toContain("https://www.farqad-edu.com/api/health");
    expect(step("uptime_monitor").todo).toMatch(/UptimeRobot.*٥ دقائق/);
  });

  it("gives every step one sentence to act on and a place to do it", () => {
    for (const s of evaluate().steps) {
      expect(s.todo.trim().length, s.key).toBeGreaterThan(10);
      expect(s.where.label.trim().length, s.key).toBeGreaterThan(2);
      expect(s.todo, s.key).not.toMatch(/—/);
    }
  });
});

describe("the verdict cannot say ready while a blocking step is open", () => {
  it("for any single blocking step, whatever its state other than done", () => {
    const { steps } = evaluate();
    const blocking = steps.filter((s) => s.blocking);
    expect(blocking.length).toBeGreaterThan(20);
    for (const target of blocking) {
      for (const state of ["open", "unknown"] as const) {
        const broken: LaunchStep[] = steps.map((s) => (s.key === target.key ? { ...s, state } : s));
        const verdict = launchVerdict(broken);
        expect(verdict.ready, `${target.key} ${state}`).toBe(false);
        expect(verdict.blockingOpen.map((s) => s.key)).toEqual([target.key]);
      }
    }
  });

  it("and says not ready when there is nothing to judge", () => {
    expect(launchVerdict([]).ready).toBe(false);
  });

  const cases: [string, string, (f: LaunchFacts) => void][] = [
    ["a migration is missing", "migrations", (f) => (f.migrations = { applied: REQUIRED_MIGRATIONS.slice(0, -1) })],
    ["migrations cannot be read", "migrations", (f) => (f.migrations = null)],
    ["APP_URL is a vercel.app address", "app_url", (f) => (f.appUrl = "https://farqad.vercel.app")],
    ["APP_URL is local", "app_url", (f) => (f.appUrl = "http://localhost:3000")],
    ["APP_URL is not https", "app_url", (f) => (f.appUrl = "http://www.farqad-edu.com")],
    ["APP_URL is a test domain", "app_url", (f) => (f.appUrl = "https://farqad.test")],
    ["TRUST_PROXY is off on Vercel", "trust_proxy", (f) => (f.trustProxy = false)],
    ["an admin has no two-factor", "owner_2fa", (f) => (f.admins = { total: 2, enrolled: 1 })],
    ["two-factor is switched off", "owner_2fa", (f) => (f.twoFactorRequired = false)],
    ["admins cannot be read", "owner_2fa", (f) => (f.admins = null)],
    ["mail only logs", "mail", (f) => (f.mail = { driver: "log", lastSentAt: null, lastFailedAt: null })],
    ["no email was ever sent", "mail", (f) => (f.mail = { driver: "smtp", lastSentAt: null, lastFailedAt: null })],
    ["the last email failed", "mail", (f) => (f.mail = { driver: "smtp", lastSentAt: at("2026-11-01T00:00:00Z"), lastFailedAt: at("2026-11-09T00:00:00Z") })],
    ["OPS_ALERT_EMAIL is missing", "ops_alert_email", (f) => (f.opsAlertEmail = false)],
    ["CRON_SECRET is missing", "cron_secret", (f) => (f.cronSecret = false)],
    ["a job failed", "jobs", (f) => (f.jobs![0] = { ...f.jobs![0], status: "failed" })],
    ["a job is late", "jobs", (f) => (f.jobs![1] = { ...f.jobs![1], status: "late" })],
    ["a job never ran", "jobs", (f) => (f.jobs![2] = { ...f.jobs![2], status: "never" })],
    ["jobs cannot be read", "jobs", (f) => (f.jobs = null)],
    ["the seller licence number is missing", "seller_identity", (f) => (f.settings!.sellerMissing = ["license_number"])],
    ["there is no phone or WhatsApp", "contact", (f) => (f.settings!.contactPhone = false)],
    ["there is no contact email", "contact", (f) => (f.settings!.contactEmail = false)],
    ["nothing published is on sale", "catalog", (f) => (f.catalog = { published: 3, stopped: 3 })],
    ["files are not scanned", "files_scanned", (f) => (f.content!.unchecked = 4)],
    ["a selling teacher has no share", "teachers", (f) => (f.teachers!.missingShare = 1)],
    ["a selling teacher did not accept the agreement", "teachers", (f) => (f.teachers!.missingAgreement = 1)],
    ["fee rules are not confirmed", "fee_rules", (f) => (f.settings!.feeRulesConfirmed = false)],
    ["an open test order is left", "test_orders", (f) => (f.testOrders!.openOrders = 1)],
    ["an open test payment is left", "test_orders", (f) => (f.testOrders!.openPayments = 1)],
    ["a test entitlement still opens content", "test_orders", (f) => (f.testOrders!.entitlements = 1)],
    ["a test coupon redemption still counts", "test_orders", (f) => (f.testOrders!.redemptions = 1)],
    ["payments are in sandbox", "payment_mode", (f) => (f.payments = { ...f.payments, mode: "sandbox", environment: "sandbox" })],
    ["live is set but disabled", "payment_mode", (f) => (f.payments = { ...f.payments, enabled: false, environment: "none", liveConfirmed: false, reason: "وضع الإنتاج يتطلب تأكيدًا صريحًا" })],
    ["the webhook secret is missing", "webhook_secret", (f) => (f.payments.webhookSecret = false)],
    ["reconciliation is daily", "reconcile_cadence", (f) => (f.reconcile = "daily")],
    ["no live refund notice arrived", "webhooks_received", (f) => (f.webhooks!.liveRefund = null)],
    ["no live payment notice arrived", "webhooks_received", (f) => (f.webhooks!.livePayment = null)],
    ["webhooks cannot be read", "webhooks_received", (f) => (f.webhooks = null)],
    ["Bunny is selected without its keys", "video", (f) => (f.video.bunnyKeys = false)],
    ["settings cannot be read", "seller_identity", (f) => (f.settings = null)],
  ];

  for (const [name, key, patch] of cases) {
    it(`when ${name}`, () => {
      const { verdict, step } = evaluate(patch);
      expect(verdict.ready).toBe(false);
      expect(step(key).blocking).toBe(true);
      expect(step(key).state).not.toBe("done");
      expect(verdict.blockingOpen.map((s) => s.key)).toContain(key);
    });
  }

  for (const key of MANUAL_KEYS) {
    it(`when the manual step ${key} is not ticked`, () => {
      const ticks = allTicked();
      delete ticks[key];
      const { verdict, step } = evaluate(undefined, ticks);
      expect(step(key).state).toBe("open");
      expect(verdict.ready).toBe(false);
      expect(verdict.blockingOpen.map((s) => s.key)).toEqual([key]);
    });
  }

  it("when a manual step was ticked and then reopened", () => {
    const ticks = allTicked();
    ticks.live_payment = { ...ticks.live_payment!, done: false };
    const { verdict, step } = evaluate(undefined, ticks);
    expect(step("live_payment").state).toBe("open");
    expect(step("live_payment").manual?.tick).toBeNull();
    expect(verdict.ready).toBe(false);
  });

  it("when ticks cannot be read: every applicable manual step is unknown and still blocking", () => {
    const { verdict, steps } = evaluate(undefined, null);
    const manual = steps.filter((s) => s.kind === "manual");
    expect(manual.every((s) => s.state === "unknown" && s.blocking)).toBe(true);
    expect(verdict.ready).toBe(false);
  });
});

describe("a tick for an older wording", () => {
  it("reopens the step and says why", () => {
    const ticks = allTicked();
    ticks.lawyer_review = { ...ticks.lawyer_review!, version: "terms 2026-10-draft-1; privacy old" };
    const { verdict, step } = evaluate(undefined, ticks);
    expect(step("lawyer_review").state).toBe("open");
    expect(step("lawyer_review").manual?.stale).toBe(true);
    expect(step("lawyer_review").facts[0]).toMatch(/نسخة سابقة/);
    expect(verdict.ready).toBe(false);
  });

  it("the lawyer review is bound to the current legal document versions", () => {
    for (const version of Object.values(CONSENT_VERSIONS)) expect(MANUAL_VERSIONS.lawyer_review).toContain(version);
  });
});

describe("steps that are not needed now", () => {
  it("never block: a notes-only launch with no teacher content and no Vercel is still ready", () => {
    const { verdict, step } = evaluate((f) => {
      f.video = { provider: "file", allowFileVideo: false, hostingBlocked: true, bunnyKeys: false, bunnyCdnHost: false };
      f.teachers = { selling: 0, missingShare: 0, missingAgreement: 0, managedSelling: 0 };
      f.settings!.feeRulesConfirmed = false;
      f.deployment.vercelEnv = null;
      f.trustProxy = false;
    });
    for (const key of ["bunny_cdn_token", "bunny_mp4_off", "bunny_real_test", "teachers", "trust_proxy"]) {
      expect(step(key).state, key).toBe("na");
      expect(step(key).blocking, key).toBe(false);
    }
    expect(step("video").state).toBe("done");
    expect(step("fee_rules").blocking).toBe(false);
    expect(verdict.ready).toBe(true);
  });

  it("Bunny steps apply as soon as video is sold through Bunny, even when settings cannot be read", () => {
    const { step } = evaluate((f) => (f.settings = null), {});
    for (const key of ["bunny_cdn_token", "bunny_mp4_off", "bunny_real_test"]) {
      expect(step(key).state, key).toBe("open");
      expect(step(key).blocking, key).toBe(true);
    }
  });

  it("Bunny steps are not needed when the owner switched video off", () => {
    const { step } = evaluate((f) => (f.settings!.videosEnabled = false));
    expect(step("bunny_cdn_token").state).toBe("na");
  });
});

describe("warnings that do not block", () => {
  it("flagged files, previews to repair, stopped products, raw video and a hidden site warn without blocking", () => {
    const { verdict, step } = evaluate((f) => {
      f.content = { unchecked: 0, flagged: 2, badPreviews: 3 };
      f.catalog = { published: 5, stopped: 1 };
      f.indexing = { indexable: false, disabledBySetting: true };
    });
    for (const key of ["flagged_files", "previews", "stopped_products", "indexing"]) {
      expect(step(key).state, key).toBe("open");
      expect(step(key).blocking, key).toBe(false);
    }
    expect(verdict.ready).toBe(true);
    expect(verdict.optionalOpen).toBe(4);
  });

  it("a downloadable file video is a warning, not a block", () => {
    const { step } = evaluate((f) => (f.video = { provider: "file", allowFileVideo: true, hostingBlocked: false, bunnyKeys: false, bunnyCdnHost: false }));
    expect(step("video").state).toBe("open");
    expect(step("video").blocking).toBe(false);
    expect(step("video").facts.join(" ")).toMatch(/ALLOW_FILE_VIDEO=true/);
  });
});

describe("what the page may say", () => {
  it("shows only the host of APP_URL, never a user name or password in it", () => {
    expect(appUrlCheck("https://owner:hunter2-do-not-print@www.farqad-edu.com/path?token=abc")).toEqual({ host: "www.farqad-edu.com", problem: null });
    const { steps } = evaluate((f) => (f.appUrl = "https://owner:hunter2-do-not-print@www.farqad-edu.com/?token=abc"));
    const text = JSON.stringify(steps);
    expect(text).not.toMatch(/hunter2|token=abc|owner:/);
  });

  it("names why an APP_URL is not the real domain", () => {
    const problem = (url: string) => appUrlCheck(url).problem;
    expect(problem("not a url")).toBe("invalid");
    expect(problem("http://127.0.0.1:3000")).toBe("local");
    expect(problem("http://127.1:3000")).toBe("local");
    expect(problem("http://[::1]:3000")).toBe("local");
    expect(problem("http://app.localhost")).toBe("local");
    expect(problem("https://203.0.113.7")).toBe("ip");
    expect(problem("https://[2001:db8::1]")).toBe("ip");
    expect(problem("https://intranet")).toBe("test_domain");
    expect(problem("https://farqad.example")).toBe("test_domain");
    expect(problem("https://127.farqad-edu.com")).toBeNull();
    expect(problem("https://www.farqad-edu.com")).toBeNull();
  });

  it("accepts only known manual keys", () => {
    for (const key of MANUAL_KEYS) expect(isManualKey(key)).toBe(true);
    for (const key of ["", "migrations", "__proto__", "constructor", "toString", "vercel_pro "]) expect(isManualKey(key), key).toBe(false);
  });
});

describe("the required migrations", () => {
  it("are every migration file from 0010 on, so a new one cannot be forgotten here", () => {
    const files = readdirSync(resolve(__dirname, "../../db/migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) >= 10);
    expect([...REQUIRED_MIGRATIONS].sort()).toEqual(files.sort());
  });
});
