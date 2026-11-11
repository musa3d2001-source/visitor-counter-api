import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loginWithPassword, registerStudent, requestPasswordReset, resetPassword } from "@/server/auth/service";
import { createHmac } from "node:crypto";
import { DEVICE_PROOF_DAYS, issueDeviceProof, verifyDeviceProof } from "@/server/auth/device-proof";
import { deriveKey } from "@/server/auth/two-factor-core";
import { resetEnvCache } from "@/server/env";
import { startSmtpSink, type SmtpSink } from "../mocks/smtp-sink";
import { closeDb, resetDb, sql } from "../helpers/db";
import { createUser, TEST_PASSWORD } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

let sink: SmtpSink;
const SECRET = TEST_ENV.APP_SECRET!;

beforeAll(async () => {
  await resetDb();
  sink = await startSmtpSink();
});
afterAll(async () => {
  await sink.close();
  await closeDb();
});
beforeEach(() => {
  sink.clear();
  process.env.MAIL_DRIVER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(sink.port);
  process.env.MAIL_FROM = "no-reply@farqad.test";
  resetEnvCache();
  return sql`delete from rate_limits`;
});
afterEach(() => {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.MAIL_FROM;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

const mailsTo = (address: string) => sink.messages.filter((m) => m.to.includes(address));
const linkIn = (text: string) => decodeURIComponent(/reset-password\?token=(\S+)/.exec(text)![1]!);
const seed = (key: string, count: number) => sql`insert into rate_limits (key, count, reset_at) values (${key}, ${count}, now() + interval '1 hour') on conflict (key) do update set count = excluded.count`;
const meta = (ip: string, deviceProof?: string) => ({ ip, userAgent: "t", deviceProof });

describe("password reset requests", () => {
  it("someone who knows the address cannot use up the student's limit from one network", async () => {
    const u = await createUser();
    for (let i = 0; i < 10; i++) await requestPasswordReset(u.email, "203.0.113.20");
    expect(mailsTo(u.email)).toHaveLength(3);
    await requestPasswordReset(u.email, "198.51.100.20");
    expect(mailsTo(u.email)).toHaveLength(4);
  });

  it("a stranger's request does not cancel a link the student already has", async () => {
    const u = await createUser();
    await requestPasswordReset(u.email, "198.51.100.21");
    const studentLink = linkIn(mailsTo(u.email).at(-1)!.text);
    await requestPasswordReset(u.email, "203.0.113.21");
    expect(await resetPassword(studentLink, "Fresh-Student-Pass-1")).toEqual({ ok: true });
  });

  it("using one link cancels every other", async () => {
    const u = await createUser();
    await requestPasswordReset(u.email, "198.51.100.22");
    await requestPasswordReset(u.email, "198.51.100.22");
    const [second, first] = mailsTo(u.email).slice().reverse().map((m) => linkIn(m.text));
    expect(await resetPassword(first!, "Fresh-Student-Pass-1")).toEqual({ ok: true });
    expect((await resetPassword(second!, "Other-Student-Pass-2")).ok).toBe(false);
  });

  it("a link that was never delivered leaves no live token", async () => {
    const u = await createUser();
    sink.rejectNext();
    await requestPasswordReset(u.email, "198.51.100.23");
    expect(await sql`select 1 from password_reset_tokens where user_id = ${u.id}`).toHaveLength(0);
  });

  it("the account still has a ceiling across many networks", async () => {
    const u = await createUser();
    for (let i = 0; i < 25; i++) await requestPasswordReset(u.email, `203.0.114.${i}`);
    expect(mailsTo(u.email)).toHaveLength(20);
  });

  it("requests past the network's limit do not count against the account", async () => {
    const u = await createUser();
    await seed("reset:ip:203.0.113.24", 100);
    for (let i = 0; i < 5; i++) await requestPasswordReset(u.email, "203.0.113.24");
    expect(mailsTo(u.email)).toHaveLength(0);
    expect(await sql`select 1 from rate_limits where key like ${`reset:acct:${u.email}%`}`).toHaveLength(0);
  });

  it("a network below its limit keeps working for a whole class", async () => {
    await seed("reset:ip:203.0.113.25", 99);
    const u = await createUser();
    await requestPasswordReset(u.email, "203.0.113.25");
    expect(mailsTo(u.email)).toHaveLength(1);
  });
});

describe("registration from one network", () => {
  const input = (email: string) => ({ fullName: "طالب جديد", email, password: "Student-Pass-1", phone: null, acceptedDocuments: true, acceptedGuardian: true });

  it("a school registering together is not stopped", async () => {
    await seed("register:ip:203.0.113.30", 199);
    expect((await registerStudent(input("school-kid@farqad.test"), meta("203.0.113.30"))).ok).toBe(true);
  });

  it("flooding is, and the message speaks of the network", async () => {
    await seed("register:ip:203.0.113.31", 200);
    expect(await registerStudent(input("flood@farqad.test"), meta("203.0.113.31"))).toEqual({ ok: false, error: "محاولات تسجيل كثيرة من هذه الشبكة. حاول لاحقًا." });
  });
});

describe("a device that has proved itself", () => {
  const BLOCKED = "203.0.113.40";
  const block = () => seed(`login:ipfail:${BLOCKED}`, 100);

  it("a correct password alone does not lift a network block, since that would remove the limit", async () => {
    const u = await createUser();
    await block();
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta(BLOCKED))).toMatchObject({ ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." });
  });

  it("the proof comes from a correct password, and gets that account through a blocked network", async () => {
    const u = await createUser();
    const first = await loginWithPassword(u.email, TEST_PASSWORD, meta("198.51.100.40"));
    expect(first.ok && first.deviceProof).toBeTruthy();
    await block();
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta(BLOCKED, first.deviceProof))).toMatchObject({ ok: true });
  });

  it("a wrong password earns no proof", async () => {
    const u = await createUser();
    expect((await loginWithPassword(u.email, "wrong-password", meta("198.51.100.41"))).deviceProof).toBeUndefined();
  });

  it("registering earns none, since it proves nothing about the address: the first sign-in earns it", async () => {
    const r = await registerStudent({ fullName: "طالب", email: "proof-at-signup@farqad.test", password: "Student-Pass-1", phone: null, acceptedDocuments: true, acceptedGuardian: true }, meta("198.51.100.42"));
    expect(r).not.toHaveProperty("deviceProof");
    const first = await loginWithPassword("proof-at-signup@farqad.test", "Student-Pass-1", meta("198.51.100.42"));
    expect(verifyDeviceProof(first.deviceProof, "proof-at-signup@farqad.test", SECRET)).toBe(true);
  });

  it("a proof for one account does not open another", async () => {
    const [a, b] = [await createUser(), await createUser()];
    await block();
    expect((await loginWithPassword(b.email, TEST_PASSWORD, meta(BLOCKED, issueDeviceProof(a.email, SECRET)))).ok).toBe(false);
  });

  it("a proof does not replace the password: wrong guesses with it lock that browser, and only that browser (R004)", async () => {
    const u = await createUser();
    const proof = issueDeviceProof(u.email, SECRET);
    await block();
    for (let i = 0; i < 5; i++) expect((await loginWithPassword(u.email, `guess-${i}`, meta(BLOCKED, proof))).ok).toBe(false);
    const locked = await loginWithPassword(u.email, TEST_PASSWORD, meta(BLOCKED, proof));
    expect(locked).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
    // عدّاد الزوج لم يُمس، ومتصفح آخر أثبت الحساب نفسه يدخل
    expect(await sql`select 1 from rate_limits where key = ${`login:fail:${u.email.toLowerCase()}|${BLOCKED}`}`).toHaveLength(0);
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta(BLOCKED, issueDeviceProof(u.email, SECRET)))).toMatchObject({ ok: true });
  });

  it("a stranger on the same address cannot lock out a browser that has signed in before (R004)", async () => {
    const u = await createUser();
    const ip = "10.0.0.9";
    const first = await loginWithPassword(u.email, TEST_PASSWORD, meta(ip));
    expect(first.ok && first.deviceProof).toBeTruthy();
    // بلا إثبات: ١٥ تخمينًا خاطئًا من العنوان نفسه
    for (let i = 0; i < 15; i++) expect((await loginWithPassword(u.email, `stranger-${i}`, meta(ip))).ok).toBe(false);
    const stranger = await loginWithPassword(u.email, TEST_PASSWORD, meta(ip));
    expect(stranger).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
    // الطالب في متصفحه، على العنوان نفسه، بكلمته الصحيحة: يدخل من أول محاولة، ولا يمسح قفل الغريب
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta(ip, first.deviceProof))).toMatchObject({ ok: true });
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta(ip))).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
  });

  it("the account ceiling still holds for browsers without a proof, and a reset clears the browser's counter too", async () => {
    const u = await createUser();
    await seed(`login:fail:${u.email.toLowerCase()}|*`, 20);
    await sql`update rate_limits set reset_at = now() + interval '1 hour' where key = ${`login:fail:${u.email.toLowerCase()}|*`}`;
    expect(await loginWithPassword(u.email, TEST_PASSWORD, meta("198.51.100.43"))).toMatchObject({ ok: false, error: expect.stringContaining("إيقاف تسجيل الدخول مؤقتًا") });
    const proof = issueDeviceProof(u.email, SECRET);
    for (let i = 0; i < 6; i++) await loginWithPassword(u.email, `guess-${i}`, meta("198.51.100.43", proof));
    const keys = await sql<{ key: string }[]>`select key from rate_limits where starts_with(key, ${`login:fail:${u.email.toLowerCase()}|dev:`})`;
    expect(keys).toHaveLength(1);
    // البصمة لا الإثبات: لا يُكتب الإثبات في قاعدة البيانات
    expect(keys[0].key).not.toContain(proof);
  });

  it("failures from a proved device still count against the network", async () => {
    const u = await createUser();
    const ip = "203.0.113.41";
    await loginWithPassword(u.email, "wrong-password", meta(ip, issueDeviceProof(u.email, SECRET)));
    const [row] = await sql<{ count: number }[]>`select count from rate_limits where key = ${`login:ipfail:${ip}`}`;
    expect(row.count).toBe(1);
  });
});

describe("the proof itself", () => {
  const NOW = 1_900_000_000_000;

  it("is valid for its own account until it expires", () => {
    const proof = issueDeviceProof("Student@Farqad.test", SECRET, NOW);
    expect(verifyDeviceProof(proof, "student@farqad.test", SECRET, NOW + 1000)).toBe(true);
    expect(verifyDeviceProof(proof, "student@farqad.test", SECRET, NOW + DEVICE_PROOF_DAYS * 86400_000 - 1000)).toBe(true);
    expect(verifyDeviceProof(proof, "student@farqad.test", SECRET, NOW + DEVICE_PROOF_DAYS * 86400_000 + 1000)).toBe(false);
  });

  it("rejects tampering, another secret and junk", () => {
    const proof = issueDeviceProof("a@farqad.test", SECRET, NOW);
    const [expires, nonce, mac] = proof.split(".");
    expect(verifyDeviceProof(`${Number(expires) + 86400}.${nonce}.${mac}`, "a@farqad.test", SECRET, NOW)).toBe(false);
    expect(verifyDeviceProof(`${expires}.${"A".repeat(22)}.${mac}`, "a@farqad.test", SECRET, NOW)).toBe(false);
    // الرقم العشوائي جزء مما يُوقّع: لا يُحذف لتصير صيغة قديمة
    expect(verifyDeviceProof(`${expires}.${mac}`, "a@farqad.test", SECRET, NOW)).toBe(false);
    expect(verifyDeviceProof(proof, "a@farqad.test", `${SECRET}-other`, NOW)).toBe(false);
    for (const junk of [undefined, "", "abc", "1.2.3", "1.2.3.4", `${expires}.`, `.${mac}`, "x".repeat(200), `abc.${nonce}.${mac}`, `${expires}.${nonce}!.${mac}`]) {
      expect(verifyDeviceProof(junk, "a@farqad.test", SECRET, NOW), String(junk)).toBe(false);
    }
  });

  it("is different on every sign-in, so two browsers never share a counter", () => {
    const a = issueDeviceProof("a@farqad.test", SECRET, NOW);
    const b = issueDeviceProof("a@farqad.test", SECRET, NOW);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(120);
    expect(verifyDeviceProof(a, "a@farqad.test", SECRET, NOW)).toBe(true);
    expect(verifyDeviceProof(b, "a@farqad.test", SECRET, NOW)).toBe(true);
  });

  it("a proof issued before the nonce is still accepted until it expires", () => {
    const expires = String(Math.floor(NOW / 1000) + 86400);
    const legacy = `${expires}.${createHmac("sha256", deriveKey(SECRET, "login-device-proof")).update(`a@farqad.test|${expires}`).digest("base64url")}`;
    expect(verifyDeviceProof(legacy, "a@farqad.test", SECRET, NOW)).toBe(true);
    expect(verifyDeviceProof(legacy, "b@farqad.test", SECRET, NOW)).toBe(false);
    expect(verifyDeviceProof(legacy, "a@farqad.test", SECRET, NOW + 2 * 86400_000)).toBe(false);
  });
});
