import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(css|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const fonts = read("src/app/fonts.ts");
const calls = fonts.split(/= localFont\(/).slice(1);

describe("site fonts", () => {
  it("has one source of faces, so no page pays for a second copy", () => {
    const others = walk(join(root, "src")).filter((f) => !f.endsWith("fonts.ts") && /@fontsource/.test(readFileSync(f, "utf8")));
    expect(others).toEqual([]);
  });

  it("is applied from the root layout, so every route gets the faces and the preload", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import { fontClassNames } from "./fonts"');
    expect(layout).toContain("className={fontClassNames}");
  });

  it("never lets Arabic text swap late", () => {
    expect(calls.length).toBe(6);
    for (const c of calls) expect(c).toContain('display: "fallback"');
  });

  it("preloads only the faces of the first paint", () => {
    const preloaded = calls.filter((c) => c.includes("preload: true")).flatMap((c) => [...c.matchAll(/files\/([a-z0-9-]+)\.woff2/g)].map((m) => m[1]));
    expect(preloaded.sort()).toEqual(["cairo-arabic-wght-normal", "tajawal-arabic-400-normal", "tajawal-arabic-700-normal", "tajawal-latin-400-normal"]);
    for (const c of calls) expect(c).toMatch(/preload: (true|false)/);
  });

  it("names both families the design tokens use, and limits each file to its script", () => {
    const css = read("src/app/globals.css");
    for (const family of ["Tajawal", "Cairo Variable"]) {
      expect(fonts).toContain(`value: "${family}"`);
      expect(css).toContain(`"${family}"`);
    }
    for (const c of calls) expect(c).toContain('prop: "unicode-range"');
  });
});
