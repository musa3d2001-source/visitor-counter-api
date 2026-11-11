import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { beforeAll, describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * البند R021: ورقة الموقع (globals.css) لا تولّد أصناف لوحة التحكم والمختبر، وورقة اللوحة (admin/admin.css) كاملة.
 * يُترجم الملفان بـ Tailwind نفسه الذي يستعمله البناء، ويُقارن ما فيهما.
 */
const root = join(__dirname, "../..");
const src = join(root, "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const STAFF_DIRS = ["src/app/admin", "src/app/lab", "src/components/admin"];
const isStaff = (rel: string) => STAFF_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(relative(root, p).replaceAll("\\", "/"));
  }
  return out;
}

async function compile(rel: string) {
  const from = join(root, rel);
  const out = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(readFileSync(from, "utf8"), { from });
  return out.css;
}

/** أسماء الأصناف في الورقة الناتجة، بفك الهروب (\: و \[ ...) */
function classNames(css: string): Set<string> {
  const names = new Set<string>();
  // ما يبدأ برقم كسر عشري في قيمة (مثل .05em)، لا صنف
  for (const m of css.matchAll(/\.((?:\\.|[A-Za-z_-])(?:\\.|[A-Za-z0-9_-])*)/g)) names.add(m[1].replace(/\\(.)/g, "$1"));
  return names;
}
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

let publicCss = "";
let staffCss = "";
beforeAll(async () => {
  publicCss = await compile("src/app/globals.css");
  staffCss = await compile("src/app/admin/admin.css");
}, 60_000);

describe("R021: the site sheet leaves out admin and lab classes", () => {
  it("excludes the admin and lab folders from the site sheet, and shares the theme tokens with the admin sheet", () => {
    const globals = read("src/app/globals.css");
    for (const line of ['@source not "./admin";', '@source not "./lab";', '@source not "../components/admin";', '@import "./theme.css";']) expect(globals).toContain(line);
    expect(globals).not.toMatch(/@theme\b/);
    const staff = withoutComments(read("src/app/admin/admin.css"));
    expect(staff).toContain('@import "../theme.css";');
    expect(staff).toContain('@import "tailwindcss/utilities.css" layer(utilities);');
    // ورقة جزئية (لملفات اللوحة وحدها) كانت ستقلب ترتيب بعض الأصناف: لا @source ولا preflight هنا
    expect(staff).not.toMatch(/@source|preflight|@import "tailwindcss";/);
  });

  it("loads the admin sheet only from the admin and lab layouts", () => {
    const importers = files(src).filter((f) => /import\s+["'][^"']*admin\.css["']/.test(read(f)));
    expect(importers.sort()).toEqual(["src/app/admin/layout.tsx", "src/app/lab/layout.tsx"]);
  });

  it("no public page renders a component from the admin or lab folders, whose classes the site sheet no longer has", () => {
    const offenders = files(src)
      .filter((f) => f.endsWith(".tsx") && !isStaff(f))
      .filter((f) => /from\s+["'](@\/components\/admin|@\/app\/admin|@\/app\/lab)[/"']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the site sheet has no class used only in admin or lab files, and is much smaller", () => {
    const pub = classNames(publicCss);
    const staff = classNames(staffCss);
    const staffOnly = [...staff].filter((c) => !pub.has(c));
    // ما خرج من ورقة الموقع موجود فعلًا في ملفات اللوحة أو المختبر
    const staffSources = files(src).filter(isStaff).map(read).join("\n");
    expect(staffOnly.length).toBeGreaterThan(300);
    for (const c of staffOnly) expect(staffSources, c).toContain(c.replace(/^[a-z-]+:/, "").split(":").pop()!);
    // نحو 159 KB خام (25 KB مضغوطة) بدل نحو 250 KB (34 KB)
    expect(publicCss.length).toBeLessThan(175_000);
    expect(gzipSync(publicCss).length).toBeLessThan(27_000);
  });

  // كل صفحة تحمل وحدات CSS التي تستوردها فقط، لا الست مدموجة (الرئيسية كانت تحمل أنماط المنتج والتصفح والمعلمين والباقات)
  it("splits the site's CSS modules per route, at about one request per 8 KB", async () => {
    const config = await nextConfig(PHASE_DEVELOPMENT_SERVER);
    expect(config.experimental?.cssChunking).toEqual({ type: "graph", requestCost: 8_000 });
  });

  // ترتيب التحميل بين الوحدات قد يتغير مع التقسيم. لا يضر إلا عنصرًا عليه صنفان من وحدتين يضبطان الخاصية نفسها،
  // والموضع الوحيد لذلك شبكات browse فوق catalog، وأولويتها مضاعفة فيه
  it("no element carries classes from two CSS modules except browse's grids, which win in any order", () => {
    const tsx = files(src).filter((f) => f.endsWith(".tsx"));
    const twoModules = tsx.filter((f) => (read(f).match(/from\s+["'][^"']+\.module\.css["']|catalogStyles/g) ?? []).length > 1);
    expect(twoModules).toEqual(["src/components/site/card-parts.tsx"]);
    const passed = tsx.filter((f) => /<(ProductGrid|ProductShelf|ProductList|ProductCard|ProductRow|ExamTicket|VideoCard|NoteCard|BundleCard|GradeCard|SubjectTile|TeacherCard|Kicker|PriceInline|CompactPrice|OwnedChip|SaleEndedChip)\b[^>]*?className=\{(cn\()?[a-z]\./s.test(read(f)));
    expect(passed).toEqual([]);
    const browse = read("src/app/(site)/grades/_components/browse.module.css");
    // أصناف balancedGrid كلها، وكل ظهور لها في محدد مضاعف
    for (const c of ["md2", "md3", "vmd3", "vmd3e", "lg3", "lg4", "lg5"]) {
      const single = browse.match(new RegExp(`\\.${c}(?![\\w-])`, "g"))?.length ?? 0;
      const doubled = browse.match(new RegExp(`\\.${c}\\.${c}(?![\\w-])`, "g"))?.length ?? 0;
      expect(doubled, c).toBeGreaterThan(0);
      expect(single, c).toBe(doubled * 2);
    }
  });

  it("the admin sheet repeats every site utility, so a later copy decides each conflict in Tailwind's own order", () => {
    const pub = classNames(publicCss);
    const staff = classNames(staffCss);
    const globals = read("src/app/globals.css");
    // أصناف components في globals.css وحدها لا تتكرر، وكل ما سواها (أصناف Tailwind) يتكرر
    const missing = [...pub].filter((c) => !staff.has(c) && !globals.includes(`.${c}`));
    expect(missing).toEqual([]);
    expect(staffCss).not.toMatch(/::file-selector-button|@layer base\s*\{/);
  });
});
