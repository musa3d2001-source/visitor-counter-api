import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/grades/[gradeId]/subjects/route";
import { getDb } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { resetPublicCacheForTests } from "@/server/platform/public-cache";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createProduct, gradeAndSubject } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

const ask = (gradeId: string) => GET(new NextRequest(`http://localhost/api/grades/${gradeId}/subjects`), { params: Promise.resolve({ gradeId }) });

beforeAll(resetDb);
afterAll(closeDb);

describe("GET /api/grades/:id/subjects", () => {
  it("returns the subjects of one grade that have published products, and nothing private", async () => {
    await createProduct({ level: 6, subjectSlug: "math" });
    await createProduct({ level: 7, subjectSlug: "science" });
    const { gradeId } = await gradeAndSubject(6, "math");
    const res = await ask(gradeId);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const { subjects } = await res.json();
    expect(subjects).toHaveLength(1);
    expect(Object.keys(subjects[0]).sort()).toEqual(["icon", "id", "name", "productCount", "slug"]);
    expect(subjects[0]).toMatchObject({ slug: "math", productCount: 1 });
  });

  it("lists nothing for a subject whose only product is not published", async () => {
    const p = await createProduct({ level: 8, subjectSlug: "math" });
    const { gradeId } = await gradeAndSubject(8, "math");
    await sql`update products set status = 'hidden' where id = ${p.id}`;
    const { subjects } = await (await ask(gradeId)).json();
    expect(subjects).toEqual([]);
  });

  it("answers 400 for something that is not an id, before touching the database", async () => {
    expect((await ask("grade-7")).status).toBe(400);
    expect((await ask("1' or '1'='1")).status).toBe(400);
  });

  it("comes from the public cache, so tab clicks on a busy home page do not reach the database", async () => {
    await createProduct({ level: 9, subjectSlug: "math" });
    const { gradeId } = await gradeAndSubject(9, "math");
    process.env.PUBLIC_CACHE_SECONDS = "30";
    resetEnvCache();
    resetPublicCacheForTests();
    const db = getDb();
    const statements: string[] = [];
    try {
      await ask(gradeId);
      (db.options as { debug?: unknown }).debug = (_connection: number, query: string) => {
        statements.push(query);
      };
      const { subjects } = await (await ask(gradeId)).json();
      expect(subjects).toHaveLength(1);
      expect(statements).toEqual([]);
    } finally {
      (db.options as { debug?: unknown }).debug = undefined;
      Object.assign(process.env, TEST_ENV);
      resetEnvCache();
      resetPublicCacheForTests();
    }
  });

  it("answers an empty list for an unknown grade", async () => {
    const res = await ask("22222222-2222-4222-8222-222222222222");
    expect(res.status).toBe(200);
    expect((await res.json()).subjects).toEqual([]);
  });
});
