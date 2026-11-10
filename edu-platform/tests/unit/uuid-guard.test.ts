import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

/**
 * معرّف من رابط عام يصل إلى Postgres فقط بعد فحص شكله الكامل.
 * الفحص الأضعف /^[0-9a-f-]{36}$/ يقبل ٣٦ شرطة، فيرمي Postgres خطأ 22P02 يسجله الخادم، وأي زائر يكرره بلا تسجيل دخول.
 */
describe("isUuid", () => {
  it("accepts a real uuid in either case", () => {
    expect(isUuid("3f2b1c9a-1111-4222-8333-444455556666")).toBe(true);
    expect(isUuid("3F2B1C9A-1111-4222-8333-444455556666")).toBe(true);
  });

  it.each(["-".repeat(36), "0".repeat(36), "3f2b1c9a11114222833344445555666600ab", "3f2b1c9a-1111-4222-8333-44445555666", "3f2b1c9a-1111-4222-8333-4444555566667", " 3f2b1c9a-1111-4222-8333-444455556666", "", null, undefined])("rejects %j", (value) => {
    expect(isUuid(value as string | null | undefined)).toBe(false);
  });
});

describe("the source", () => {
  const root = resolve(__dirname, "../../src");
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : []));

  it("has no loose 36-character id check left", () => {
    const loose = files(root).filter((file) => !file.endsWith(join("lib", "uuid.ts")) && /\[0-9a-f-\]\{36\}/i.test(readFileSync(file, "utf8")));
    expect(loose).toEqual([]);
  });
});
