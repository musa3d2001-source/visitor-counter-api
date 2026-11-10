import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const app = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("links prefetch on intent only", () => {
  it("every next/link says prefetch={false}: a card on the screen must not cost a server request", () => {
    const missing: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (rel.startsWith("app/lab/")) continue;
      const code = readFileSync(file, "utf8");
      if (!code.includes('from "next/link"')) continue;
      const links = code.match(/<Link(?=[\s>])/g)?.length ?? 0;
      const off = code.match(/<Link\s+prefetch=\{false\}/g)?.length ?? 0;
      if (links !== off) missing.push(`${rel}: ${links - off}`);
    }
    expect(missing).toEqual([]);
  });

  it("the root layout mounts what starts the prefetch on intent and the bar", () => {
    const layout = app("app/layout.tsx");
    expect(layout).toContain("<NavFeedback />");
    expect(layout).toContain("<NoScriptStreaming />");
  });
});

describe("what must stay above a loading boundary", () => {
  it.each(["app", "app/(site)", "app/(site)/(auth)"])("%s has no loading file, so a page under it keeps its status and redirect", (rel) => {
    expect(readdirSync(join(SRC, rel))).not.toContain("loading.tsx");
  });

  it.each([
    ["app/(site)/products/[slug]/layout.tsx", "getProductBySlug"],
    ["app/(site)/teachers/[slug]/layout.tsx", "getTeacherBySlug"],
    ["app/(site)/grades/[gradeSlug]/layout.tsx", "getGradeBySlug"],
    ["app/(site)/grades/[gradeSlug]/[subjectSlug]/layout.tsx", "getSubject"],
    ["app/(site)/stages/[slug]/layout.tsx", "getStageBySlug"],
  ])("%s rejects an unknown address before streaming starts", (rel, read) => {
    const code = app(rel);
    expect(code).toContain(read);
    expect(code).toMatch(/notFound\(\)/);
  });
});
