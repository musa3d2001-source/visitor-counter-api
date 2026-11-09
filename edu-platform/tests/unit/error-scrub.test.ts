import { afterEach, describe, expect, it } from "vitest";
import { redactSecrets, scrubForOps, scrubStack } from "@/lib/redact";

const SET: string[] = [];
function setEnv(name: string, value: string) {
  SET.push(name);
  process.env[name] = value;
}

afterEach(() => {
  for (const name of SET.splice(0)) delete process.env[name];
});

describe("scrubForOps removes what may be a secret or a person", () => {
  it.each([
    ["an email address", "mail to sara.k@students.kw bounced", "sara.k@students.kw"],
    ["a connection string", "connect postgres://edu:pw12345@db.internal:5432/app refused", "pw12345"],
    ["a bearer token", "got Bearer abc.def.ghi back", "abc.def.ghi"],
    ["a password pair", 'password="hunter2" rejected', "hunter2"],
    ["a token query in a link", "fetch https://darb.example/reset?token=abcdef failed", "abcdef"],
    ["a cookie header", "cookie: session=abcdef1234", "abcdef1234"],
    ["a uuid", "row 3f2b1c9a-1111-4222-8333-444455556666 failed", "3f2b1c9a"],
    ["an ip address", "from 192.168.4.22 denied", "192.168.4.22"],
    ["an ipv6 address", "from 2001:db8:85a3::8a2e:370:7334 denied", "2001:db8"],
    ["a link whose path names a person", "GET https://cdn.example/files/sara-notes.pdf failed", "sara-notes"],
    ["a card number with spaces", "card 4111 1111 1111 1111 declined", "4111"],
    ["a card number without spaces", "card 4111111111111111 declined", "4111111111111111"],
    ["a kuwaiti phone number", "sms to 99887766 failed", "99887766"],
    ["a phone in eastern digits", "الهاتف ٩٩٨٨٧٧٦٦ لم يرد", "٩٩٨٨٧٧٦٦"],
    ["a value quoted by the database", `invalid input syntax for type uuid: "ahmad-123"`, "ahmad-123"],
    ["a long opaque run", `signature ${"a1B2".repeat(12)} wrong`, "a1B2a1B2"],
    ["a windows home folder", "at C:\\Users\\sara\\app\\x.js", "sara"],
    ["a unix home folder", "at /home/sara/app/x.js", "sara"],
  ])("%s", (_label, input, secret) => {
    expect(scrubForOps(input)).not.toContain(secret);
  });

  it("removes the literal value of a deployment secret wherever it appears", () => {
    setEnv("MYFATOORAH_API_KEY", "plainkey");
    expect(scrubForOps("gateway said plainkey is bad")).not.toContain("plainkey");
  });

  it("removes the host and user of the database url even when only they appear", () => {
    setEnv("DATABASE_URL", "postgres://svcuser:dbpass99@db.private.host:5432/app");
    const out = scrubForOps("could not reach db.private.host as svcuser with dbpass99");
    expect(out).not.toMatch(/db\.private\.host|svcuser|dbpass99/);
  });

  it("keeps database object names, which come from our code and explain the failure", () => {
    expect(scrubForOps('relation "teachers" does not exist')).toBe('relation "teachers" does not exist');
    expect(scrubForOps('duplicate key value violates unique constraint "users_email_key"')).toContain("users_email_key");
  });

  it("says a card was there, so the owner knows what kind of number it was", () => {
    expect(scrubForOps("card 4111-1111-1111-1111 declined")).toBe("card [card] declined");
  });

  it("is one line, and bounded", () => {
    const out = scrubForOps(`line one\nline two ${"word ".repeat(200)}`);
    expect(out).not.toContain("\n");
    expect(scrubForOps("bell\u0007 escape\u001b[31m red\u007f")).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(scrubForOps("x y ".repeat(200), 20).length).toBeLessThanOrEqual(20);
  });
});

describe("scrubStack", () => {
  const stack = ["Error: failed for sara@example.com", "    at handler (/home/sara/app/route.js:10:5)", "    at next (node:internal/process/task_queues:95:5)", "    at a (x.js:1:1)", "    at b (x.js:1:1)", "    at c (x.js:1:1)"].join("\n");

  it("keeps the frames, never the message line", () => {
    const out = scrubStack(stack)!;
    expect(out).not.toContain("sara@example.com");
    expect(out).toContain("at handler");
    expect(out).not.toContain("/home/sara");
  });

  it("is bounded", () => {
    expect(scrubStack(stack, 2)!.split("\n")).toHaveLength(2);
    expect(scrubStack(undefined)).toBeNull();
    expect(scrubStack("no frames here")).toBeNull();
  });
});

describe("redactSecrets keeps its behaviour after moving", () => {
  it("hides link tokens and long runs and leaves the rest", () => {
    expect(redactSecrets("open https://x.test/reset?token=abc123 now")).toBe("open https://x.test/reset?token=[REDACTED] now");
    expect(redactSecrets(`code ${"z".repeat(43)}`)).toBe("code [REDACTED]");
  });
});
