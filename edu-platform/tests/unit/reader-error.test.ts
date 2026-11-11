import { describe, expect, it } from "vitest";
import {
  FILE_CONNECTION_MESSAGE,
  FILE_NEEDS_REPAIR_MESSAGE,
  FILE_SERVER_FAILED_MESSAGE,
  FILE_STILL_BUSY_MESSAGE,
  FILE_TOO_MANY_OPENS_MESSAGE,
  READER_ENGINE_FAILED_MESSAGE,
  READER_OPEN_FAILED_MESSAGE,
  READER_RETRY,
  answerFailure,
  fileAnswerKind,
  jitteredWaitMs,
  networkRetryDelaySeconds,
  readerErrorMessage,
  readerFailure,
  readerRetryDelaySeconds,
  type FileAnswer,
} from "@/lib/reader-error";

/** رد التطبيق كما يرسله مسار الملفات أو الرد الموحد للانشغال */
const app = (status: number, body: FileAnswer["body"], retryAfter: string | null = null): FileAnswer => ({ status, retryAfter, appJson: true, platformError: null, body: { error: "x", ...body } as FileAnswer["body"] });
/** رد منصة الاستضافة: نص أو HTML، وربما x-vercel-error */
const platform = (status: number, platformError: string | null = "FUNCTION_THROTTLED", retryAfter: string | null = null): FileAnswer => ({ status, retryAfter, appJson: false, platformError, body: {} });

describe("رسالة القارئ", () => {
  it("a password-protected file is never blamed on the student's connection", () => {
    const err = Object.assign(new Error("No password given"), { name: "PasswordException", code: 1 });
    expect(readerErrorMessage(err)).toBe(FILE_NEEDS_REPAIR_MESSAGE);
  });

  it("the file needs repair only when the server says so with its code", () => {
    expect(readerErrorMessage(answerFailure(app(503, { code: "repair" })))).toBe(FILE_NEEDS_REPAIR_MESSAGE);
  });

  // كان 503 بلا Retry-After يُقرأ «ملفًا معيبًا». منصة الاستضافة ترد 503 كهذا عند الذروة، فصار الحكم برمز الخادم وحده (R017)
  it("a platform 503 that outlasted the retries is a busy platform, never a damaged file", () => {
    for (const a of [platform(503), platform(503, null), platform(502, null), platform(504, null)]) {
      expect(readerErrorMessage(answerFailure(a))).toBe(FILE_STILL_BUSY_MESSAGE);
      expect(readerErrorMessage(answerFailure(a))).not.toBe(FILE_NEEDS_REPAIR_MESSAGE);
    }
  });

  it("session and permission answers stay distinct", () => {
    expect(readerErrorMessage(answerFailure(app(401, { code: "signin" })))).toContain("سجّل الدخول");
    expect(readerErrorMessage(answerFailure(app(403, { code: "denied" })))).toContain("صلاحية");
    expect(readerErrorMessage(answerFailure(app(404, { code: "not_found" })))).toContain("لم نجد");
  });

  it("a busy server that outlasted the automatic retries says so, without blaming the file", () => {
    expect(readerErrorMessage(answerFailure(app(503, { code: "busy", retry: true }, "10")))).toBe(FILE_STILL_BUSY_MESSAGE);
    expect(readerErrorMessage(answerFailure(app(429, { code: "preparing", retry: true }, "5")))).toBe(FILE_STILL_BUSY_MESSAGE);
    expect(readerErrorMessage(answerFailure(app(503, { busy: true }, "5")))).toBe(FILE_STILL_BUSY_MESSAGE);
  });

  it("the account open limit is its own message", () => {
    expect(readerErrorMessage(answerFailure(app(429, { code: "too_many_opens", retry: false }, "120")))).toBe(FILE_TOO_MANY_OPENS_MESSAGE);
  });

  it("each failure says where it happened: the server, the connection, the engine, or the browser opening the file", () => {
    expect(readerErrorMessage(answerFailure(app(500, { code: "failed" })))).toBe(FILE_SERVER_FAILED_MESSAGE);
    expect(readerErrorMessage(readerFailure({ stage: "network" }))).toBe(FILE_CONNECTION_MESSAGE);
    expect(readerErrorMessage(readerFailure({ stage: "engine" }))).toBe(READER_ENGINE_FAILED_MESSAGE);
    expect(readerErrorMessage(readerFailure({ stage: "open" }))).toBe(READER_OPEN_FAILED_MESSAGE);
    // ما وصل كاملًا ولم يُفتح ليس مشكلة اتصال
    expect(READER_OPEN_FAILED_MESSAGE).not.toContain("اتصال");
    expect(READER_ENGINE_FAILED_MESSAGE).toContain("حدّث المتصفح");
  });

  it.each([[new Error("network")], [null], [undefined]])("anything unknown suggests trying again: %j", (err) => {
    expect(readerErrorMessage(err)).toContain("حاول مرة أخرى");
  });
});

describe("إعادة المحاولة التلقائية في القارئ", () => {
  it("tells the app's own busy answers from the platform's, and both from final refusals", () => {
    expect(fileAnswerKind(app(503, { code: "busy", retry: true }, "10"))).toBe("app");
    expect(fileAnswerKind(app(503, { busy: true }, "5"))).toBe("app");
    expect(fileAnswerKind(app(429, { code: "preparing", retry: true }, "4"))).toBe("app");
    expect(fileAnswerKind(platform(503))).toBe("platform");
    expect(fileAnswerKind(platform(503, null))).toBe("platform");
    expect(fileAnswerKind(platform(504, null))).toBe("platform");
    expect(fileAnswerKind({ ...app(503, {}), platformError: "FUNCTION_THROTTLED" })).toBe("platform");
    expect(fileAnswerKind(app(503, { code: "repair" }))).toBe("final");
    expect(fileAnswerKind(app(429, { code: "too_many_opens", retry: false }, "120"))).toBe("final");
    expect(fileAnswerKind(platform(429, null))).toBe("final");
    expect(fileAnswerKind(platform(500, null))).toBe("final");
  });

  it("waits as long as the app says", () => {
    expect(readerRetryDelaySeconds(app(503, { retry: true }, "10"), 0)).toBe(10);
    expect(readerRetryDelaySeconds(app(429, { retry: true }, "5"), 3)).toBe(5);
    expect(readerRetryDelaySeconds(app(503, { busy: true }, "30"), 0)).toBe(30);
  });

  it("is bounded on both sides", () => {
    expect(readerRetryDelaySeconds(app(503, { retry: true }, "0"), 0)).toBe(READER_RETRY.minWaitSeconds);
    expect(readerRetryDelaySeconds(app(503, { retry: true }, "200"), 0)).toBe(READER_RETRY.maxWaitSeconds);
  });

  it("stops after the allowed attempts", () => {
    expect(readerRetryDelaySeconds(app(503, { retry: true }, "5"), READER_RETRY.attempts - 1)).toBe(5);
    expect(readerRetryDelaySeconds(app(503, { retry: true }, "5"), READER_RETRY.attempts)).toBeNull();
  });

  it("retries a platform 503 twice, after 5 then 15 seconds, or after its Retry-After when it sends one", () => {
    expect(READER_RETRY.platformAttempts).toBe(2);
    expect(readerRetryDelaySeconds(platform(503), 0)).toBe(5);
    expect(readerRetryDelaySeconds(platform(503), 1)).toBe(15);
    expect(readerRetryDelaySeconds(platform(503), 2)).toBeNull();
    expect(readerRetryDelaySeconds(platform(503, null, "8"), 0)).toBe(8);
    expect(readerRetryDelaySeconds(platform(502, null), 0)).toBe(5);
  });

  it.each([
    ["a damaged file", app(503, { code: "repair" })],
    ["the account limit: the server said do not retry", app(429, { code: "too_many_opens", retry: false }, "120")],
    ["an app answer without a retry flag", app(503, {}, "5")],
    ["not a temporary status", app(403, { code: "denied", retry: true }, "5")],
    ["a nonsense wait from the app", app(503, { retry: true }, "soon")],
    ["an app busy answer without Retry-After", app(503, { retry: true })],
    ["a server error", app(500, { code: "failed" })],
  ])("does not retry %s", (_label, answer) => {
    expect(readerRetryDelaySeconds(answer, 0)).toBeNull();
  });

  it("never comes back before Retry-After, and spreads students over up to twice the wait", () => {
    expect(jitteredWaitMs(10, 0)).toBe(10_000);
    expect(jitteredWaitMs(10, 1)).toBe(20_000);
    expect(jitteredWaitMs(10, 2)).toBe(20_000);
    expect(jitteredWaitMs(10, -1)).toBe(10_000);
    // مئة طالب رُدوا معًا بمهلة 10 ثوانٍ: عودتهم موزعة على أكثر من نصف النافذة، لا في الثانية نفسها
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const waits = Array.from({ length: 100 }, () => jitteredWaitMs(10, random()));
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(10_000);
    expect(Math.max(...waits) - Math.min(...waits)).toBeGreaterThan(5_000);
  });

  it("retries a dropped connection once", () => {
    expect(networkRetryDelaySeconds(0)).toBe(READER_RETRY.networkWaitSeconds);
    expect(networkRetryDelaySeconds(1)).toBeNull();
  });
});
