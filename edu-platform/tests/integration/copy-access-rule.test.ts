import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkFileAccess, mainFileAccessSql } from "@/server/access/entitlements";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createTeacher, createUser } from "../helpers/factories";

/**
 * mainFileAccessSql هو قاعدة checkFileAccess للملف الرئيسي مكتوبة شرطًا في SQL: يقرؤه حفظ النسخة المختومة (keepCopy)
 * والتنظيف اليومي (البنود V1 و V2 و V3). إن اختلف عنها حُذفت نسخة صاحب حق، أو بقيت نسخة من لا حق له.
 * كل حالة هنا تُسأل عنها القاعدتان معًا، والجواب المتوقع مكتوب بجانبها.
 */
beforeAll(resetDb);
afterAll(closeDb);

type Who = { id: string; role: string };

async function both(user: Who, fileId: string) {
  const [row] = await sql<{ ok: boolean }[]>`select ${mainFileAccessSql(sql, user.id, fileId)} as ok`;
  const access = await checkFileAccess(fileId, user);
  return { sqlRule: row.ok, checkFileAccess: access.ok };
}

const grant = (userId: string, productId: string, opts: { revoked?: boolean; expiresInDays?: number } = {}) => sql`
  insert into entitlements (user_id, product_id, source, revoked_at, expires_at)
  values (${userId}, ${productId}, 'manual', ${opts.revoked ? sql`now()` : null}, ${opts.expiresInDays === undefined ? null : sql`now() + make_interval(days => ${opts.expiresInDays})`})
`;

describe("mainFileAccessSql answers what checkFileAccess answers for a main file", () => {
  const cases: [string, boolean, () => Promise<{ user: Who; fileId: string }>][] = [
    ["a student with a direct entitlement", true, async () => {
      const p = await createProduct();
      const u = await createUser();
      await grant(u.id, p.id);
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student with nothing", false, async () => ({ user: await createUser(), fileId: (await createProduct()).mainFileId! })],
    ["a student whose entitlement was revoked", false, async () => {
      const p = await createProduct();
      const u = await createUser();
      await grant(u.id, p.id, { revoked: true });
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student whose access ran out", false, async () => {
      const p = await createProduct();
      const u = await createUser();
      await grant(u.id, p.id, { expiresInDays: -1 });
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student whose access runs out later", true, async () => {
      const p = await createProduct();
      const u = await createUser();
      await grant(u.id, p.id, { expiresInDays: 3 });
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student who owns only the bundle", true, async () => {
      const p = await createProduct();
      const b = await createBundle({ items: [p.id] });
      const u = await createUser();
      await grant(u.id, b.id);
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student who owns a bundle of a bundle", true, async () => {
      const p = await createProduct();
      const inner = await createBundle({ items: [p.id] });
      const outer = await createBundle({ items: [inner.id] });
      const u = await createUser();
      await grant(u.id, outer.id);
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student whose bundle was revoked", false, async () => {
      const p = await createProduct();
      const b = await createBundle({ items: [p.id] });
      const u = await createUser();
      await grant(u.id, b.id, { revoked: true });
      return { user: u, fileId: p.mainFileId! };
    }],
    ["a student whose bundle ran out", false, async () => {
      const p = await createProduct();
      const b = await createBundle({ items: [p.id] });
      const u = await createUser();
      await grant(u.id, b.id, { expiresInDays: -1 });
      return { user: u, fileId: p.mainFileId! };
    }],
    ["the self-managed teacher of the product", true, async () => {
      const p = await createProduct();
      const t = await createTeacher({ mode: "self_managed" });
      await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
      return { user: t.user!, fileId: p.mainFileId! };
    }],
    ["a teacher with an account whose product the platform manages", false, async () => {
      const p = await createProduct();
      const t = await createTeacher({ mode: "managed", withUser: true });
      await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
      return { user: t.user!, fileId: p.mainFileId! };
    }],
    ["a self-managed teacher of another product", false, async () => {
      const p = await createProduct();
      const t = await createTeacher({ mode: "self_managed" });
      return { user: t.user!, fileId: p.mainFileId! };
    }],
    ["a teacher who bought another teacher's note", true, async () => {
      const p = await createProduct();
      const t = await createTeacher({ mode: "self_managed" });
      await grant(t.user!.id, p.id);
      return { user: t.user!, fileId: p.mainFileId! };
    }],
    ["a student account linked to a self-managed teacher row", false, async () => {
      const p = await createProduct();
      const t = await createTeacher({ mode: "self_managed" });
      await sql`update users set role = 'student' where id = ${t.user!.id}`;
      await sql`update products set teacher_id = ${t.id} where id = ${p.id}`;
      return { user: { id: t.user!.id, role: "student" }, fileId: p.mainFileId! };
    }],
  ];

  it.each(cases)("%s (%s)", async (_label, expected, setup) => {
    const { user, fileId } = await setup();
    expect(await both(user, fileId)).toEqual({ sqlRule: expected, checkFileAccess: expected });
  });

  it("reads a column of the surrounding query as well as a parameter", async () => {
    const p = await createProduct();
    const [owner, other] = [await createUser(), await createUser()];
    await grant(owner.id, p.id);
    const rows = await sql<{ id: string; ok: boolean }[]>`
      select v.user_id as id, ${mainFileAccessSql(sql, sql`v.user_id`, sql`v.file_id`)} as ok
      from (values (${owner.id}::uuid, ${p.mainFileId}::uuid), (${other.id}::uuid, ${p.mainFileId}::uuid)) as v(user_id, file_id)
    `;
    expect(Object.fromEntries(rows.map((r) => [r.id, r.ok]))).toEqual({ [owner.id]: true, [other.id]: false });
  });
});
