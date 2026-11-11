import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * حدود الذاكرة العامة، على مستوى الكود نفسه: من يستطيع أن يقرأ منها ومن لا يجوز له.
 * فحص نصي عن قصد: استيراد واحد في مسار الدفع يكفي ليقرر سعرًا أو صلاحية من بيانات قديمة.
 */
const SRC = resolve(__dirname, "../../src");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

const ALL = filesUnder(SRC).map((full) => ({ path: relative(SRC, full).replaceAll("\\", "/"), text: readFileSync(full, "utf8") }));
const IMPORTS_CACHE = /from\s+["'][^"']*(public-cache|public-data|public-settings)["']/;

/** المسارات التي تقرر الوصول أو المال أو التسليم: قاعدة البيانات وحدها */
const MUST_READ_THE_DATABASE = [
  /^server\/access\//,
  /^server\/auth\//,
  /^server\/payments\//,
  /^server\/commerce\//,
  /^server\/video\//,
  /^app\/api\//,
  /^app\/\(site\)\/checkout\//,
  /^app\/\(site\)\/orders\//,
  /^app\/\(site\)\/cart\/actions\.ts$/,
  /^app\/admin\//,
  /^server\/admin\//,
];

/** عام بلا جلسة: قائمة المواد نفسها التي ترسمها الصفحة الرئيسية من الذاكرة، ولا يقرر وصولًا ولا مالًا ولا تسليمًا */
const PUBLIC_CATALOGUE_ROUTE = "app/api/grades/[gradeId]/subjects/route.ts";

describe("who may touch the public cache", () => {
  it("only the two public modules call publicCached", () => {
    const callers = ALL.filter((f) => /\bpublicCached\s*[(<]/.test(f.text)).map((f) => f.path).sort();
    expect(callers).toEqual(["server/catalog/public-data.ts", "server/platform/public-cache.ts", "server/platform/public-settings.ts"]);
  });

  it("nothing that decides access, money or delivery imports it, and the scan really covers those paths", () => {
    const guarded = ALL.filter((f) => f.path !== PUBLIC_CATALOGUE_ROUTE && MUST_READ_THE_DATABASE.some((rule) => rule.test(f.path)));
    expect(guarded.length).toBeGreaterThan(150);
    for (const needle of ["server/access/lessons.ts", "server/commerce/cart.ts", "server/payments/service.ts", "app/(site)/checkout/page.tsx", "app/api/lessons/[lessonId]/stream/route.ts"]) {
      expect(guarded.map((f) => f.path)).toContain(needle);
    }
    const offenders = guarded.filter((f) => IMPORTS_CACHE.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the one catalogue route allowed to use it reads no session and touches no access or money", () => {
    const route = ALL.find((f) => f.path === PUBLIC_CATALOGUE_ROUTE)!;
    expect(route.text).toMatch(IMPORTS_CACHE);
    expect(route.text).not.toMatch(/server\/(auth|access|payments|commerce|video|admin)\b|cookies\(|getCurrentUser/);
  });

  it("the owner's settings form compares against a database read, never the cached copy", () => {
    const actions = ALL.find((f) => f.path === "app/admin/settings/actions.ts")!;
    expect(actions.text).toMatch(/\breadSettings\b/);
    expect(actions.text).not.toMatch(/public-settings|getPublicSettings/);
  });

  it("the public settings carry no fee or watermark field", () => {
    const file = ALL.find((f) => f.path === "server/platform/public-settings.ts")!;
    expect(file.text).not.toMatch(/"fee_|"watermark/);
  });

  it("the one read of orders behind the cache is the best-seller ranking, and no page counts sales per view (R030)", () => {
    const file = ALL.find((f) => f.path === "server/catalog/public-data.ts")!;
    expect([...file.text.matchAll(/\bq\.bestSellers\b/g)]).toHaveLength(1);
    expect(file.text).toContain("publicCached(`best-sellers:${gradeId}:${limit}`, () => q.bestSellers({ gradeId, limit }))");
    // الترتيب الحي لا تستورده صفحة: كل عرض لها كان يعدّ سجل الطلبات
    const pagesImportingLive = ALL.filter((f) => /^app\//.test(f.path) && /import\s*\{[^}]*\bbestSellers\b[^}]*\}\s*from\s*["']@\/server\/catalog\/queries["']/.test(f.text)).map((f) => f.path);
    expect(pagesImportingLive).toEqual([]);
  });
});

describe("admin changes reach the cache", () => {
  it("every admin mutation goes through the invalidating revalidatePath", () => {
    const admin = ALL.filter((f) => /^app\/admin\/|^app\/api\/admin\//.test(f.path));
    expect(admin.filter((f) => /from\s+["']next\/cache["']/.test(f.text)).map((f) => f.path)).toEqual([]);
    const using = admin.filter((f) => /\brevalidatePath\(/.test(f.text));
    expect(using.length).toBeGreaterThanOrEqual(15);
    for (const f of using) expect(f.text, f.path).toMatch(/from\s+["']@\/server\/platform\/revalidate["']/);
  });
});

describe("the admin dashboard and the connection pool", () => {
  it("no group of reads is wider than the five connections, so the page does not fill the pool on its own", () => {
    const page = ALL.find((f) => f.path === "app/admin/page.tsx")!;
    const owner = page.text.slice(0, page.text.indexOf("teacherDashboard(actor.teacherId)"));
    const widths = [...owner.matchAll(/Promise\.all\(\[([^\]]*)\]\)/g)].map((m) => m[1].split(/,\s*(?![^()]*\))/).length);
    expect(widths.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...widths)).toBeLessThanOrEqual(4);
  });
});

describe("robots and sitemap", () => {
  const config = readFileSync(resolve(__dirname, "../../next.config.ts"), "utf8");

  it("robots is held by the CDN, because it changes only with a new deployment", () => {
    expect(config).toMatch(/source: "\/robots\.txt", headers: \[\{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=3600" \}\]/);
  });

  it("the sitemap is not, so a removed product leaves it within the minute", () => {
    expect(config).not.toMatch(/sitemap\.xml/);
  });
});
