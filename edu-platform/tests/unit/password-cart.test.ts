import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password-core";
import { generateToken, hashToken } from "@/server/auth/session";
import { parseCartCookie } from "@/server/commerce/cart";

describe("password hashing (scrypt)", () => {
  it("hashes with salt and verifies", async () => {
    const h1 = await hashPassword("correct horse battery");
    const h2 = await hashPassword("correct horse battery");
    expect(h1).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("correct horse battery", h1)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h1)).toBe(false);
    expect(await verifyPassword("", h1)).toBe(false);
  });
  it("normalizes unicode (NFKC) so Arabic presentation forms match", async () => {
    const h = await hashPassword("كلمة سر");
    expect(await verifyPassword("كلمة سر".normalize("NFKD"), h)).toBe(true);
  });
  it("rejects malformed stored hashes", async () => {
    for (const bad of ["", "plain", "bcrypt$x", "scrypt$a$b$c$d$e", "scrypt$1$2"]) {
      expect(await verifyPassword("x", bad), bad).toBe(false);
    }
  });
});

describe("session tokens", () => {
  it("tokens are 256-bit random and stored as sha256 hex", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
  });
});

describe("cart cookie parsing (untrusted input)", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));
  it("accepts valid uuids and dedupes", () => {
    expect(parseCartCookie(enc([id, id]))).toEqual([id]);
  });
  it("drops non-uuid and non-string entries, ignores prices or objects", () => {
    expect(parseCartCookie(enc([id, "'; drop table orders; --", 5, { id, price: 0 }, null]))).toEqual([id]);
  });
  it("handles garbage safely", () => {
    for (const bad of ["", "not json", "%E0%A4%A", enc({ a: 1 }), enc("x"), enc(null)]) {
      expect(parseCartCookie(bad), bad).toEqual([]);
    }
  });
  it("caps the number of items", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `11111111-2222-3333-4444-${String(i).padStart(12, "0")}`);
    expect(parseCartCookie(enc(ids))).toHaveLength(30);
  });
});
