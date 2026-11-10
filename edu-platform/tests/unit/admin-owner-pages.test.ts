import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isOwnerOnlyPath, OWNER_ONLY_PREFIXES } from "@/lib/admin-paths";

/**
 * صفحات المالك محمية بطبقتين: رفض مبكر في التخطيط حسب المسار، وrequireOwnerPage() داخل الصفحة.
 * صفحة مالك جديدة تُنسى في إحداهما تسقط هذا الاختبار.
 */
const ADMIN_DIR = join(process.cwd(), "src", "app", "admin");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

function routeOf(file: string): string {
  const parts = relative(ADMIN_DIR, file).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
  return ["/admin", ...parts].join("/");
}

const all = pages(ADMIN_DIR).map((file) => ({ route: routeOf(file), callsOwnerCheck: /\brequireOwnerPage\(\)/.test(readFileSync(file, "utf8")) }));

describe("owner-only admin pages", () => {
  it("finds the admin pages", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("every page that calls requireOwnerPage sits under an owner-only prefix", () => {
    const outside = all.filter((p) => p.callsOwnerCheck && !isOwnerOnlyPath(p.route)).map((p) => p.route);
    expect(outside).toEqual([]);
  });

  it("every page under an owner-only prefix calls requireOwnerPage", () => {
    const unguarded = all.filter((p) => isOwnerOnlyPath(p.route) && !p.callsOwnerCheck).map((p) => p.route);
    expect(unguarded).toEqual([]);
  });

  it("every owner-only prefix has at least one page", () => {
    for (const prefix of OWNER_ONLY_PREFIXES) expect(all.some((p) => p.route === prefix || p.route.startsWith(`${prefix}/`)), prefix).toBe(true);
  });

  it("matches on segment boundaries", () => {
    expect(isOwnerOnlyPath("/admin/orders")).toBe(true);
    expect(isOwnerOnlyPath("/admin/orders/1")).toBe(true);
    expect(isOwnerOnlyPath("/admin/ordersx")).toBe(false);
    expect(isOwnerOnlyPath("/admin/products")).toBe(false);
  });
});
