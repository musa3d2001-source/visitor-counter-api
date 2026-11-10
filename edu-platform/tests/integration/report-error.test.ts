import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";
import { resetEnvCache } from "@/server/env";
import { listErrorEvents, reportError, reportRequestError, resetErrorReporterForTests } from "@/server/platform/report-error";
import { closeDb, resetDb, sql } from "../helpers/db";

type Row = { fingerprint: string; source: string; route: string | null; message: string; stack: string | null; digest: string | null; occurrences: number };

const rows = () => sql<Row[]>`select fingerprint, source, route, message, stack, digest, occurrences from error_events order by id`;
const alertMails = () => sql<{ subject: string; body: string }[]>`select subject, body from email_log where template = 'ops_alert' order by created_at`;

beforeAll(resetDb);
afterAll(closeDb);

beforeEach(async () => {
  await sql`truncate error_events, ops_alert_state, email_log restart identity`;
  resetErrorReporterForTests();
  process.env.OPS_ALERT_EMAIL = "owner@darb.school";
  resetEnvCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPS_ALERT_EMAIL;
  delete process.env.NEXT_RUNTIME;
  resetEnvCache();
});

describe("what is stored", () => {
  it("records the error with its source and the route pattern", async () => {
    await reportError("checkout:init", new TypeError("boom"), { route: "/checkout" });
    const [row] = await rows();
    expect(row).toMatchObject({ source: "checkout:init", route: "/checkout", message: "TypeError: boom", occurrences: 1 });
    expect(row.stack).toContain("at ");
  });

  it("leaves out a class name that production minified away, and keeps the database code", async () => {
    await reportError("db", Object.assign(new Error('relation "teachers" does not exist'), { name: "r", code: "42P01" }));
    expect((await rows())[0].message).toBe('42P01: relation "teachers" does not exist');
  });

  it("stores no email, token, card, phone or id from the message or the stack", async () => {
    const err = new Error('failed for sara@students.kw card 4111 1111 1111 1111 phone 99887766 token=abc123xyz id 3f2b1c9a-1111-4222-8333-444455556666 link https://darb.example/reset?token=zzz999 "quoted person"');
    err.stack = `Error: ${err.message}\n    at reset (/home/sara/app/reset.js:1:1)`;
    await reportError("auth:reset", err);
    const text = JSON.stringify(await rows());
    for (const secret of ["sara@students.kw", "4111", "99887766", "abc123xyz", "3f2b1c9a", "zzz999", "quoted person", "/home/sara"]) expect(text).not.toContain(secret);
  });

  it("does not turn an object that is not an Error into text", async () => {
    await reportError("x", { password: "hunter2", email: "sara@students.kw" });
    const [row] = await rows();
    expect(row.message).toBe("خطأ من نوع غير معروف");
    expect(JSON.stringify(row)).not.toMatch(/hunter2|sara/);
  });

  it("what reaches the server log is scrubbed too", async () => {
    await reportError("auth", new Error("bounced sara@students.kw"));
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("sara@students.kw");
    expect(logged).toContain("[ops:auth]");
  });

  it("bounds every column it writes", async () => {
    await reportError("s".repeat(200), new Error("m".repeat(50) + " word ".repeat(500)), { route: `/${"r".repeat(500)}` });
    const [row] = await rows();
    expect(row.source.length).toBeLessThanOrEqual(64);
    expect(row.route!.length).toBeLessThanOrEqual(200);
    expect(row.message.length).toBeLessThanOrEqual(500);
  });

  it("keeps a safe digest and ignores one that is not", async () => {
    await reportError("a", Object.assign(new Error("one"), { digest: "123456-abc" }));
    await reportError("b", Object.assign(new Error("two"), { digest: "token=evil value" }));
    const list = await rows();
    expect(list[0].digest).toBe("123456-abc");
    expect(list[1].digest).toBeNull();
  });
});

describe("it is bounded", () => {
  // تكرارات الدقيقة نفسها تُعد في الذاكرة وتصل إلى العداد مع الكتابة التالية، لا مع كل تكرار
  it("the same error is one row with a counter, even when its numbers differ", async () => {
    const start = Date.now();
    await reportError("db", new Error("timeout after 1000ms on port 5432"));
    await reportError("db", new Error("timeout after 2500ms on port 5433"));
    expect((await rows())[0].occurrences).toBe(1);
    vi.spyOn(Date, "now").mockReturnValue(start + 61_000);
    await reportError("db", new Error("timeout after 3000ms on port 5434"));
    const list = await rows();
    expect(list).toHaveLength(1);
    expect(list[0].occurrences).toBe(3);
  });

  it("one error repeated thousands of times does not use up the budget or hide another error and its alert", async () => {
    const preview = () => reportRequestError(Object.assign(new Error('invalid input syntax for type uuid: "------------------------------------"'), { code: "22P02" }), { routePath: "/preview/[fileId]", routeType: "render" });
    for (let i = 0; i < 2000; i++) await preview();
    await reportError("checkout:init", new Error("a different failure"));
    const list = await rows();
    expect(list.map((row) => row.source)).toEqual(["request:render", "checkout:init"]);
    // الأول أرسل رسالة، والخطأ الجديد الثاني وصل إلى مسار التنبيه وعُدّ للرسالة التالية
    expect(await alertMails()).toHaveLength(1);
    expect((await sql<{ suppressed: number }[]>`select suppressed from ops_alert_state where kind = 'server_error'`)[0].suppressed).toBe(1);
  });

  it("the same message from another place is another row", async () => {
    await reportError("a", new Error("boom"));
    await reportError("b", new Error("boom"));
    await reportError("a", new Error("boom"), { route: "/other" });
    expect(await rows()).toHaveLength(3);
  });

  it("never holds more than 500 rows, and drops the oldest", async () => {
    await sql`
      insert into error_events (fingerprint, source, message, last_seen_at)
      select lpad(g::text, 64, '0'), 'old', 'old', now() - make_interval(hours => g) from generate_series(1, 500) g
    `;
    await reportError("new", new Error("a new one"));
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from error_events`;
    expect(n).toBe(500);
    expect(await sql`select 1 from error_events where source = 'new'`).toHaveLength(1);
    expect(await sql`select 1 from error_events where fingerprint = ${"500".padStart(64, "0")}`).toHaveLength(0);
  });

  it("writes at most 60 times a minute from one server", async () => {
    await Promise.all(Array.from({ length: 90 }, (_, i) => reportError(`storm-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, new Error("storm"))));
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from error_events`;
    expect(n).toBe(60);
  });
});

describe("it never makes things worse", () => {
  async function withoutTable<T>(work: () => Promise<T>): Promise<T> {
    await sql`alter table error_events rename to error_events_moved`;
    try {
      return await work();
    } finally {
      await sql`alter table error_events_moved rename to error_events`;
    }
  }

  it("does not throw when the database refuses the write", async () => {
    await withoutTable(async () => {
      await expect(reportError("x", new Error("boom"))).resolves.toBeUndefined();
    });
  });

  it("stops trying for a while after a failure, then recovers", async () => {
    await withoutTable(() => reportError("x", new Error("first")));
    await reportError("x", new Error("during the pause"));
    expect(await rows()).toHaveLength(0);
    resetErrorReporterForTests();
    await reportError("x", new Error("after the pause"));
    expect(await rows()).toHaveLength(1);
  });

  it("gives up within seconds when the database hangs, then pauses", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      markLocked = resolve;
    });
    const holder = sql.begin(async (tx) => {
      await tx`lock table error_events in access exclusive mode`;
      markLocked();
      await released;
    });
    await locked;
    // يحرر القفل بنفسه حتى لا يعلق الملف كله إن انكسر الحد
    const safety = setTimeout(release, 6000);
    const started = Date.now();
    await reportError("x", new Error("hung"));
    const waited = Date.now() - started;
    clearTimeout(safety);
    release();
    await holder;
    expect(waited).toBeLessThan(4500);
    await vi.waitFor(async () => expect(await rows()).toHaveLength(1));
    await reportError("y", new Error("during the pause"));
    expect(await rows()).toHaveLength(1);
  }, 10_000);

  it("does not throw on the strange things code can throw", async () => {
    for (const value of [undefined, null, 0, "", Symbol("s"), () => 1, Object.create(null)]) await expect(reportError("odd", value)).resolves.toBeUndefined();
  });
});

describe("the request hook", () => {
  const request = { path: "/reset-password?token=abc123xyz", method: "GET", headers: { cookie: "session=topsecretcookie", authorization: "Bearer topsecretbearer" } };

  it("stores the route pattern and never the link or the headers", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    await onRequestError!(new Error("page failed"), request as never, { routerKind: "App Router", routePath: "/reset-password", routeType: "render", renderSource: "react-server-components" } as never);
    const [row] = await rows();
    expect(row).toMatchObject({ source: "request:render", route: "/reset-password", message: "page failed" });
    expect(JSON.stringify(row)).not.toMatch(/abc123xyz|topsecret/);
  });

  it.each([
    ["a redirect", Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" })],
    ["not found", Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })],
    ["a visitor who left", Object.assign(new Error("aborted"), { name: "AbortError" })],
    ["a reset connection", Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
  ])("%s is not an error of the site", async (_label, err) => {
    await reportRequestError(err, { routePath: "/x", routeType: "render" });
    expect(await rows()).toHaveLength(0);
  });
});

describe("the owner is told about new problems only", () => {
  it("a new error sends one message", async () => {
    await reportError("x", new Error("boom"));
    const mails = await alertMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain("خطأ جديد");
  });

  it("the message is fixed text with no detail of the error", async () => {
    await reportError("x", new Error("failed for sara@students.kw"));
    const [mail] = await alertMails();
    expect(mail.body).toContain("/admin/ops");
    expect(mail.body).not.toMatch(/sara|failed for/);
  });

  it("the same error repeating sends nothing new", async () => {
    await reportError("x", new Error("boom"));
    await sql`update ops_alert_state set last_sent_at = now() - interval '1 day'`;
    await reportError("x", new Error("boom"));
    expect(await alertMails()).toHaveLength(1);
  });

  it("an old error that comes back after a quiet day is new again", async () => {
    await reportError("x", new Error("boom"));
    await sql`update ops_alert_state set last_sent_at = now() - interval '2 days'`;
    await sql`update error_events set last_seen_at = now() - interval '2 days'`;
    // يومان مرّا على ساعة هذه النسخة أيضًا، لا على قاعدة البيانات وحدها
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86_400_000);
    await reportError("x", new Error("boom"));
    expect(await alertMails()).toHaveLength(2);
  });

  it("the page can list what was recorded, newest first", async () => {
    await reportError("a", new Error("first"));
    await sql`update error_events set last_seen_at = now() - interval '1 hour'`;
    await reportError("b", new Error("second"));
    expect((await listErrorEvents()).map((e) => e.source)).toEqual(["b", "a"]);
  });
});
