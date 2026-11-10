import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { grantProduct, revokeProduct } from "@/server/access/entitlements";
import { createSession, SESSION_COOKIE } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createBundle, createProduct, createUser } from "../helpers/factories";

const jar = vi.hoisted(() => ({ token: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && jar.token ? { value: jar.token } : undefined) }),
  headers: async () => new Headers(),
}));

const { POST } = await import("@/app/api/progress/route");

function send(fileId: string, token: string | null, page = 3) {
  jar.token = token;
  return POST(
    new NextRequest("http://localhost:3000/api/progress", {
      method: "POST",
      headers: { host: "localhost:3000", "content-type": "application/json", origin: "http://localhost:3000", ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
      body: JSON.stringify({ fileId, page }),
    }),
  );
}

async function countStatements<T>(fn: () => Promise<T>): Promise<{ out: T; n: number }> {
  const db = getDb();
  let n = 0;
  (db.options as { debug?: unknown }).debug = () => {
    n++;
  };
  try {
    return { out: await fn(), n };
  } finally {
    (db.options as { debug?: unknown }).debug = undefined;
  }
}

async function reader() {
  const user = await createUser();
  const product = await createProduct({ withFile: true });
  await grantProduct(sql, { userId: user.id, productId: product.id, source: "manual", grantedBy: null, reason: "t" });
  const { token } = await createSession(user.id, {});
  return { user, product, token, fileId: product.mainFileId! };
}
const savedPage = async (userId: string, fileId: string) =>
  (await sql<{ last_page: number }[]>`select last_page from reading_progress where user_id = ${userId} and file_id = ${fileId}`)[0]?.last_page ?? null;

beforeAll(resetDb);
afterAll(closeDb);
beforeEach(() => {
  jar.token = null;
});

describe("the file access read", () => {
  it("answers in one statement, the same as the ownership rule, for an owner, a stranger, a revoked and an expired reader", async () => {
    const { checkFileAccess, hasProductAccess } = await import("@/server/access/entitlements");
    const { user, product, fileId } = await reader();
    const stranger = await createUser();
    const viewer = { id: user.id, role: user.role };

    const owner = await countStatements(() => checkFileAccess(fileId, viewer));
    expect(owner.n).toBe(1);
    expect(owner.out).toMatchObject({ ok: true, file: { id: fileId, kind: "main" } });
    expect(await hasProductAccess(user.id, product.id)).toBe(true);

    const other = await countStatements(() => checkFileAccess(fileId, { id: stranger.id, role: stranger.role }));
    expect(other.n).toBe(1);
    expect(other.out).toEqual({ ok: false, reason: "forbidden" });

    expect(await checkFileAccess(fileId, null)).toEqual({ ok: false, reason: "unauthenticated" });
    expect(await checkFileAccess("00000000-0000-4000-8000-000000000000", viewer)).toEqual({ ok: false, reason: "not_found" });

    await sql`update entitlements set expires_at = now() - interval '1 minute' where user_id = ${user.id}`;
    expect(await checkFileAccess(fileId, viewer)).toEqual({ ok: false, reason: "forbidden" });
    await sql`update entitlements set expires_at = null, revoked_at = now() where user_id = ${user.id}`;
    expect(await checkFileAccess(fileId, viewer)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("a file inside an owned bundle is owned", async () => {
    const { checkFileAccess } = await import("@/server/access/entitlements");
    const user = await createUser();
    const inside = await createProduct({ withFile: true });
    const bundle = await createBundle({ items: [inside.id] });
    await sql`insert into entitlements (user_id, product_id, source) values (${user.id}, ${bundle.id}, 'manual')`;
    expect(await checkFileAccess(inside.mainFileId!, { id: user.id, role: user.role })).toMatchObject({ ok: true });
  });
});

describe("saving the reading position", () => {
  it("the first save checks access; each page turn after it is the session and one update", async () => {
    const { user, token, fileId } = await reader();
    const first = await countStatements(() => send(fileId, token, 2));
    expect(first.out.status).toBe(200);
    expect(first.n).toBeGreaterThanOrEqual(4);
    expect(await savedPage(user.id, fileId)).toBe(2);

    const next = await countStatements(() => send(fileId, token, 9));
    expect(next.out.status).toBe(200);
    expect(next.n).toBe(2);
    expect(await savedPage(user.id, fileId)).toBe(9);
  });

  it("someone who never had the file cannot create a row, or move another reader's", async () => {
    const owner = await reader();
    await send(owner.fileId, owner.token, 5);
    const stranger = await createUser();
    const { token } = await createSession(stranger.id, {});

    expect((await send(owner.fileId, token, 99)).status).toBe(403);
    expect(await savedPage(stranger.id, owner.fileId)).toBeNull();
    expect(await savedPage(owner.user.id, owner.fileId)).toBe(5);
  });

  it("a visitor without a session is refused and writes nothing", async () => {
    const { user, fileId } = await reader();
    expect((await send(fileId, null)).status).toBe(401);
    expect(await savedPage(user.id, fileId)).toBeNull();
  });

  it("after a refund the reader moves only their own number, and a new row still needs access", async () => {
    const { user, product, token, fileId } = await reader();
    await send(fileId, token, 4);
    await revokeProduct(sql, { userId: user.id, productId: product.id, revokedBy: null, reason: "t" });
    expect((await send(fileId, token, 7)).status).toBe(200);
    expect(await savedPage(user.id, fileId)).toBe(7);

    await sql`delete from reading_progress where user_id = ${user.id}`;
    expect((await send(fileId, token, 8)).status).toBe(403);
    expect(await savedPage(user.id, fileId)).toBeNull();
  });
});
