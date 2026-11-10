import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * «skip locked» داخل IN أو CTE عادي قد يعيد المخطط تنفيذه لكل صف، فيتخطى القفل ما حدّثه الأمر نفسه ويتجاوز الدفعة حدها.
 * السلوك يعتمد على خطة الاستعلام فلا يظهر في اختبار حتمي، فنثبت الشكل نفسه: كل مطالبة دفعية داخل CTE من نوع MATERIALIZED.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const root = resolve(__dirname, "../../src/server");

describe("batch claims", () => {
  const claims = sources(root).flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [...text.matchAll(/skip locked/gi)].filter((m) => !text.slice(text.lastIndexOf("\n", m.index), m.index).includes("*")).map((m) => ({ file, before: text.slice(Math.max(0, m.index - 900), m.index) }));
  });

  it("finds the claims it is meant to guard", () => {
    expect(claims.length).toBeGreaterThanOrEqual(8);
  });

  it.each(claims.map((c, i) => [`${i}: ${c.file.slice(root.length + 1)}`, c.before] as const))("%s runs inside a MATERIALIZED batch", (_name, before) => {
    // أقرب بداية استعلام قبل القفل يجب أن تكون CTE مثبتًا، ولا يفصل بينهما SELECT خارجي
    const statement = before.slice(before.lastIndexOf("sql<") === -1 ? 0 : 0);
    const lastWith = statement.toLowerCase().lastIndexOf("as materialized (");
    expect(lastWith).toBeGreaterThan(-1);
    expect(statement.slice(lastWith)).not.toMatch(/\)\s*(update|delete)\b/i);
  });
});
