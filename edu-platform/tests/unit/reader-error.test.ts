import { describe, expect, it } from "vitest";
import { FILE_NEEDS_REPAIR_MESSAGE, FILE_STILL_BUSY_MESSAGE, FILE_TOO_MANY_OPENS_MESSAGE, READER_RETRY, readerErrorMessage, readerRetryDelaySeconds } from "@/lib/reader-error";

describe("رسالة القارئ", () => {
  it("a password-protected file is never blamed on the student's connection", () => {
    const err = Object.assign(new Error("No password given"), { name: "PasswordException", code: 1 });
    expect(readerErrorMessage(err)).toBe(FILE_NEEDS_REPAIR_MESSAGE);
  });

  it("the server saying the file needs repair reads the same", () => {
    expect(readerErrorMessage({ status: 503 })).toBe(FILE_NEEDS_REPAIR_MESSAGE);
  });

  it("session and permission answers stay distinct", () => {
    expect(readerErrorMessage({ status: 401 })).toContain("سجّل الدخول");
    expect(readerErrorMessage({ status: 403 })).toContain("صلاحية");
  });

  it.each([[{ status: 500 }], [new Error("network")], [null], [undefined]])("anything else suggests trying again: %j", (err) => {
    expect(readerErrorMessage(err)).toContain("حاول مرة أخرى");
  });

  it("a busy server that outlasted the automatic retries says so, without blaming the file", () => {
    expect(readerErrorMessage({ status: 503, retryable: true })).toBe(FILE_STILL_BUSY_MESSAGE);
    expect(readerErrorMessage({ status: 429, retryable: true })).toBe(FILE_STILL_BUSY_MESSAGE);
  });

  it("the account open limit is its own message", () => {
    expect(readerErrorMessage({ status: 429 })).toBe(FILE_TOO_MANY_OPENS_MESSAGE);
  });
});

describe("إعادة المحاولة التلقائية في القارئ", () => {
  it("waits as long as the server says", () => {
    expect(readerRetryDelaySeconds(503, "10", true, 0)).toBe(10);
    expect(readerRetryDelaySeconds(429, "5", true, 3)).toBe(5);
  });

  it("is bounded on both sides", () => {
    expect(readerRetryDelaySeconds(503, "0", true, 0)).toBe(READER_RETRY.minWaitSeconds);
    expect(readerRetryDelaySeconds(503, "200", true, 0)).toBe(READER_RETRY.maxWaitSeconds);
  });

  it("stops after the allowed attempts", () => {
    expect(readerRetryDelaySeconds(503, "5", true, READER_RETRY.attempts)).toBeNull();
  });

  it.each([
    ["a damaged file: 503 without Retry-After", 503, null, undefined],
    ["the account limit: the server said do not retry", 429, "120", false],
    ["no retry flag", 503, "5", undefined],
    ["not a temporary status", 403, "5", true],
    ["a nonsense wait", 503, "soon", true],
  ])("does not retry %s", (_label, status, retryAfter, flag) => {
    expect(readerRetryDelaySeconds(status as number, retryAfter as string | null, flag, 0)).toBeNull();
  });

  it("a busy server that outlasted the automatic retries says so, without blaming the file", () => {
    expect(readerErrorMessage({ status: 503, retryable: true })).toBe(FILE_STILL_BUSY_MESSAGE);
    expect(readerErrorMessage({ status: 429, retryable: true })).toBe(FILE_STILL_BUSY_MESSAGE);
  });

  it("the account open limit is its own message", () => {
    expect(readerErrorMessage({ status: 429 })).toBe(FILE_TOO_MANY_OPENS_MESSAGE);
  });
});

describe("إعادة المحاولة التلقائية في القارئ", () => {
  it("waits as long as the server says", () => {
    expect(readerRetryDelaySeconds(503, "10", true, 0)).toBe(10);
    expect(readerRetryDelaySeconds(429, "5", true, 3)).toBe(5);
  });

  it("is bounded on both sides", () => {
    expect(readerRetryDelaySeconds(503, "0", true, 0)).toBe(READER_RETRY.minWaitSeconds);
    expect(readerRetryDelaySeconds(503, "200", true, 0)).toBe(READER_RETRY.maxWaitSeconds);
  });

  it("stops after the allowed attempts", () => {
    expect(readerRetryDelaySeconds(503, "5", true, READER_RETRY.attempts)).toBeNull();
  });

  it.each([
    ["a damaged file: 503 without Retry-After", 503, null, undefined],
    ["the account limit: the server said do not retry", 429, "120", false],
    ["no retry flag", 503, "5", undefined],
    ["not a temporary status", 403, "5", true],
    ["a nonsense wait", 503, "soon", true],
  ])("does not retry %s", (_label, status, retryAfter, flag) => {
    expect(readerRetryDelaySeconds(status as number, retryAfter as string | null, flag, 0)).toBeNull();
  });
});
