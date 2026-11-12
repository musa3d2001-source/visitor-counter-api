import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ENV_KEYS } from "@/server/env-schema";
import { LAUNCH_GROUPS, MANUAL_KEYS, REQUIRED_MIGRATIONS, SANDBOX_PASS_CHECKS } from "@/lib/launch";

/**
 * docs/GO_LIVE.md دليل المالك، وهو لا يقرأ الكود: ما يقوله الدليل يجب أن يكون في الموقع فعلًا.
 * هذا الاختبار يربط الدليل بالكود حتى لا ينحرف عنه بصمت:
 *  - كل اسم متغير بيئة بين علامتي `...` موجود في env-schema، وكل متغير في env-schema مذكور في الدليل (جدول القسم 8).
 *  - كل نص بين «...» موجود حرفيًا في src، لأنه اسم زر أو قسم أو رسالة يبحث عنها المالك على الشاشة.
 *  - كل خطوة في صفحة الإطلاق، وكل عنوان رسالة تنبيه، وكل تحذير وعدّاد في «صحة المنصة» مذكور في الدليل.
 *  - كل ملف ترحيل لازم مذكور، وعدد بنود قائمة تجربة الدفع يساوي قائمة صفحة الإطلاق، وكل مسار /api/ في الدليل موجود.
 * و README لا يعود إلى ادعاءات ثبت أنها لم تعد صحيحة (البند R031) ولا إلى نصيحة المنطقة القديمة (R032).
 */
const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const squash = (text: string) => text.replace(/\s+/g, " ");

const GUIDE = read("docs/GO_LIVE.md");
const README = read("README.md");

function sourceText(dir: string): string {
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((name) => /\.(ts|tsx)$/.test(name));
  return files.map((name) => readFileSync(resolve(dir, name), "utf8")).join("\n");
}
const SRC = squash(sourceText(resolve(ROOT, "src")));

const ENV_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/** أسماء بشكل متغيرات البيئة داخل `...`، وحدها أو قبل = */
function envNamesIn(markdown: string): string[] {
  const names = new Set<string>();
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    const name = match[1].split("=")[0].trim();
    if (ENV_NAME.test(name)) names.add(name);
  }
  return [...names];
}

/** كل نص بين علامتي التنصيص العربيتين على سطر واحد */
function quotedLabels(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/«([^«»\n]+)»/g)].map((match) => match[1].trim()))];
}

function missingFromSource(labels: string[], source: string): string[] {
  return labels.filter((label) => !source.includes(squash(label)));
}

/** مسارات /api/ المذكورة، بلا علامات الترقيم بعدها */
function apiPathsIn(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(/\/api\/[a-z0-9_\-/]+/g)].map((match) => match[0].replace(/\/+$/, "")))];
}

const routeExists = (path: string) => existsSync(resolve(ROOT, "src/app", path.slice(1), "route.ts"));

// عناوين خطوات صفحة الإطلاق من مصدرها: كل title في launch.ts عدا عناوين المجموعات
const LAUNCH_SRC = read("src/lib/launch.ts");
const GROUP_TITLES = new Set(LAUNCH_GROUPS.map((group) => group.title));
const STEP_TITLES = [...LAUNCH_SRC.matchAll(/\btitle: "([^"]+)"/g)].map((match) => match[1]).filter((title) => !GROUP_TITLES.has(title));
const MANUAL_TITLES = new Map([...LAUNCH_SRC.matchAll(/manualStep\("(\w+)", ticks, \{\s*title: "([^"]+)"/g)].map((match) => [match[1], match[2]] as const));

const ALERT_SUBJECTS = [...read("src/server/platform/ops-alerts.ts").matchAll(/^\s+subject: "([^"]+)",$/gm)].map((match) => match[1]);
const ALERT_KINDS = [...read("src/server/platform/ops-alerts.ts").matchAll(/^\s+periodMinutes: \d+,$/gm)].length;

const OPS_PAGE = read("src/app/admin/ops/page.tsx");
const OPS_WARNINGS = [...OPS_PAGE.matchAll(/title="([^"]+)" data-testid="ops-warning-/g)].map((match) => match[1]);
const SATURATION_KINDS = (/SATURATION_KINDS = \[([^\]]+)\]/.exec(read("src/server/platform/saturation.ts"))?.[1] ?? "").match(/[a-z_]+/g) ?? [];
const SATURATION_TITLES = SATURATION_KINDS.map((kind) => new RegExp(`\\b${kind}: \\{ title: "([^"]+)"`).exec(OPS_PAGE)?.[1] ?? `(no title for ${kind})`);

describe("the matchers bite", () => {
  it("finds a made-up variable name, a label absent from the code, quoted labels and api paths", () => {
    expect(envNamesIn("set `NOT_A_REAL_VAR=1` and `PAYMENTS_MODE` but not `npm run db:migrate` or `fra1`")).toEqual(["NOT_A_REAL_VAR", "PAYMENTS_MODE"]);
    expect(envNamesIn("`NOT_A_REAL_VAR`").filter((name) => !(ENV_KEYS as string[]).includes(name))).toEqual(["NOT_A_REAL_VAR"]);
    expect(quotedLabels("اضغط «أ» ثم «ب»، ثم «أ»")).toEqual(["أ", "ب"]);
    expect(missingFromSource(["زر لا يوجد في أي مكان من الموقع", "أمان الحساب"], SRC)).toEqual(["زر لا يوجد في أي مكان من الموقع"]);
    expect(apiPathsIn("افتح `https://x/api/health`. و /api/no/such/route/.")).toEqual(["/api/health", "/api/no/such/route"]);
    expect(routeExists("/api/health")).toBe(true);
    expect(routeExists("/api/no/such/route")).toBe(false);
  });

  it("reads every launch step, alert, warning and counter from the code", () => {
    expect([...MANUAL_TITLES.keys()].sort()).toEqual([...MANUAL_KEYS].sort());
    expect(STEP_TITLES.length).toBeGreaterThanOrEqual(MANUAL_KEYS.length + 20);
    for (const title of MANUAL_TITLES.values()) expect(STEP_TITLES).toContain(title);
    expect(ALERT_KINDS).toBeGreaterThanOrEqual(8);
    expect(ALERT_SUBJECTS.length).toBeGreaterThan(ALERT_KINDS);
    expect(OPS_WARNINGS.length).toBeGreaterThanOrEqual(8);
    expect(SATURATION_KINDS.length).toBe(5);
    expect(SATURATION_TITLES.filter((title) => title.startsWith("(no title"))).toEqual([]);
  });
});

describe("docs/GO_LIVE.md matches the code", () => {
  it("names only environment variables the server reads", () => {
    const unknown = envNamesIn(GUIDE).filter((name) => !(ENV_KEYS as string[]).includes(name));
    expect(unknown).toEqual([]);
  });

  it("lists every environment variable the server reads", () => {
    const named = new Set(envNamesIn(GUIDE));
    expect(ENV_KEYS.filter((key) => !named.has(key))).toEqual([]);
  });

  it("quotes only buttons, sections and messages that exist in the site", () => {
    const labels = quotedLabels(GUIDE);
    expect(labels.length).toBeGreaterThan(50);
    expect(missingFromSource(labels, SRC)).toEqual([]);
  });

  it("covers every step of the launch page, including each one only the owner can tick", () => {
    expect(STEP_TITLES.filter((title) => !GUIDE.includes(`«${title}»`))).toEqual([]);
  });

  it("names every required database migration", () => {
    expect(REQUIRED_MIGRATIONS.filter((name) => !GUIDE.includes(name))).toEqual([]);
  });

  it("explains every owner alert, every health-page warning and every saturation counter", () => {
    expect(ALERT_SUBJECTS.filter((subject) => !GUIDE.includes(subject))).toEqual([]);
    expect(OPS_WARNINGS.filter((title) => !GUIDE.includes(`«${title}»`))).toEqual([]);
    expect(SATURATION_TITLES.filter((title) => !GUIDE.includes(`«${title}»`))).toEqual([]);
  });

  it("has one numbered item per sandbox check on the launch page", () => {
    const lines = GUIDE.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith("**قائمة التجربة**"));
    expect(start).toBeGreaterThan(-1);
    let count = 0;
    for (const line of lines.slice(start + 1)) {
      if (/^\d+\. /.test(line)) count++;
      else if (line.trim() !== "") break;
    }
    expect(count).toBe(SANDBOX_PASS_CHECKS.length);
  });

  it("points only at api routes that exist", () => {
    const paths = apiPathsIn(GUIDE);
    expect(paths).toContain("/api/health");
    expect(paths.filter((path) => !routeExists(path))).toEqual([]);
  });

  it("sends the database to Frankfurt only", () => {
    expect(GUIDE).toContain("`eu-central-1`");
    expect(GUIDE).not.toContain("me-central-1");
  });
});

describe("README no longer makes claims the code stopped making", () => {
  it.each([
    ["the old region advice", "me-central-1"],
    ["disputes changing nothing", "دون أي تغيير تلقائي"],
    ["the stamp carrying the open date", "تاريخ الفتح"],
    ["the server refusing downloads", "تُرفض من الخادم"],
    ["the old login limits", "30 لكل IP"],
    ["the old font", "IBM Plex"],
    ["a health reply with no exception", "ولا شيء غيرها"],
  ])("does not say %s", (_what, phrase) => {
    expect(README).not.toContain(phrase);
  });

  it("keeps the database next to the functions and links the owner guide", () => {
    expect(README).toContain("`eu-central-1`");
    expect(README).toContain("(docs/GO_LIVE.md)");
  });
});
