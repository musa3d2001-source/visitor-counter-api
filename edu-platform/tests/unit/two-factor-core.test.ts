import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  constantTimeEqual,
  generateRecoveryCodes,
  generateTotpSecret,
  groupForDisplay,
  hashRecoveryCode,
  hotp,
  matchTotpStep,
  openTotpSecret,
  otpauthUri,
  parseSecondFactorCode,
  RECOVERY_CODE_COUNT,
  sealTotpSecret,
  timeStep,
} from "@/server/auth/two-factor-core";

const RFC_SEED = Buffer.from("12345678901234567890");
const APP_SECRET = "unit-app-secret-0123456789abcdef-0123456789";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("HOTP and TOTP against the published vectors", () => {
  it("matches RFC 4226 appendix D", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(RFC_SEED, counter)).toBe(code));
  });

  it("matches RFC 6238 appendix B, last six digits, SHA-1", () => {
    const vectors: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
      [20000000000, "353130"],
    ];
    for (const [seconds, code] of vectors) expect(hotp(RFC_SEED, timeStep(seconds * 1000))).toBe(code);
  });

  it("uses thirty second steps", () => {
    expect(timeStep(29_999)).toBe(0);
    expect(timeStep(30_000)).toBe(1);
    expect(timeStep(59_000)).toBe(1);
  });
});

describe("the time window", () => {
  const now = 1_800_000_000_000;
  const step = timeStep(now);
  const secret = generateTotpSecret();

  it("accepts one step either way and returns the step it matched", () => {
    expect(matchTotpStep(secret, hotp(secret, step - 1), now)).toBe(step - 1);
    expect(matchTotpStep(secret, hotp(secret, step), now)).toBe(step);
    expect(matchTotpStep(secret, hotp(secret, step + 1), now)).toBe(step + 1);
  });

  it("refuses two steps either way", () => {
    expect(matchTotpStep(secret, hotp(secret, step - 2), now)).toBeNull();
    expect(matchTotpStep(secret, hotp(secret, step + 2), now)).toBeNull();
  });

  it("refuses a code of another account's secret", () => {
    expect(matchTotpStep(generateTotpSecret(), hotp(secret, step), now)).toBeNull();
  });
});

describe("base32", () => {
  it("matches RFC 4648 without padding", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Encode(Buffer.from("f"))).toBe("MY");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    expect(base32Decode("MZXW6YTBOI======").toString()).toBe("foobar");
  });

  it("round-trips a generated secret and refuses a foreign character", () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(20);
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    expect(() => base32Decode("ABC1")).toThrow();
  });
});

describe("the stored secret", () => {
  const secret = generateTotpSecret();
  const sealed = sealTotpSecret(secret, APP_SECRET, USER);

  it("is not readable in the stored form, in any encoding", () => {
    for (const encoded of [base32Encode(secret), secret.toString("hex"), secret.toString("base64"), secret.toString("base64url")]) expect(sealed).not.toContain(encoded);
  });

  it("opens with the same key and account", () => {
    expect(openTotpSecret(sealed, APP_SECRET, USER).equals(secret)).toBe(true);
  });

  it("uses a new nonce each time", () => {
    expect(sealTotpSecret(secret, APP_SECRET, USER)).not.toBe(sealed);
  });

  it("does not open with another key, on another account, or after tampering", () => {
    expect(() => openTotpSecret(sealed, `${APP_SECRET}x`, USER)).toThrow();
    expect(() => openTotpSecret(sealed, APP_SECRET, OTHER)).toThrow();
    const parts = sealed.split(".");
    const flipped = Buffer.from(parts[2], "base64url");
    flipped[0] ^= 1;
    expect(() => openTotpSecret([parts[0], parts[1], flipped.toString("base64url"), parts[3]].join("."), APP_SECRET, USER)).toThrow();
    expect(() => openTotpSecret("v2.a.b.c", APP_SECRET, USER)).toThrow();
  });
});

describe("recovery codes", () => {
  it("are ten distinct codes of eighty bits in groups", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){3}$/);
  });

  it("hash per account and per key, and never equal the code", () => {
    const code = parseSecondFactorCode(generateRecoveryCodes()[0])!.code;
    const hash = hashRecoveryCode(code, APP_SECRET, USER);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code);
    expect(hashRecoveryCode(code, APP_SECRET, OTHER)).not.toBe(hash);
    expect(hashRecoveryCode(code, `${APP_SECRET}x`, USER)).not.toBe(hash);
  });
});

describe("reading what the person typed", () => {
  it("takes Arabic and Persian digits and spaces", () => {
    expect(parseSecondFactorCode("١٢٣٤٥٦")).toEqual({ kind: "totp", code: "123456" });
    expect(parseSecondFactorCode("۱۲۳۴۵۶")).toEqual({ kind: "totp", code: "123456" });
    expect(parseSecondFactorCode(" 123 456 ")).toEqual({ kind: "totp", code: "123456" });
  });

  it("takes a recovery code in lower case, without hyphens, or with bidi marks from a copy", () => {
    const want = { kind: "recovery", code: "ABCD2345EFGH6789" };
    expect(parseSecondFactorCode("abcd-2345-efgh-6789")).toEqual(want);
    expect(parseSecondFactorCode("ABCD2345EFGH6789")).toEqual(want);
    expect(parseSecondFactorCode("‏ABCD-2345‎-EFGH–" + "6789‬")).toEqual(want);
  });

  it("refuses anything else without guessing", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "ABCD-2345-EFGH-678I", "ABCD-2345-EFGH-67890", "x".repeat(65), null, undefined, 123456, {}]) expect(parseSecondFactorCode(bad)).toBeNull();
  });
});

describe("helpers", () => {
  it("compares safely across lengths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("builds a standard otpauth link that keeps an Arabic issuer and an email intact", () => {
    const link = otpauthUri({ issuer: "منصة فرقد", account: "owner+1@example.com", secretBase32: "MZXW6YTBOI" });
    const url = new URL(link);
    expect(url.protocol).toBe("otpauth:");
    expect(url.host).toBe("totp");
    expect(decodeURIComponent(url.pathname)).toBe("/منصة فرقد:owner+1@example.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ secret: "MZXW6YTBOI", issuer: "منصة فرقد", algorithm: "SHA1", digits: "6", period: "30" });
  });

  it("groups a manual key by four", () => {
    expect(groupForDisplay("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
  });
});
