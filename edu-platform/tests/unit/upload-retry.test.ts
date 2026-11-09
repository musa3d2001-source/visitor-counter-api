import { describe, expect, it, vi } from "vitest";
import { classifyPutResponse, isTransientServerStatus, networkFailure, putWithRetry, retryDelayMs, UPLOAD_RETRY, type PutOutcome, type RetryDeps, type RetryNotice } from "@/lib/upload-retry";

function deps(over: Partial<RetryDeps> = {}) {
  const notices: RetryNotice[] = [];
  const d: RetryDeps = { sleep: vi.fn(async () => {}), isOffline: () => false, waitForOnline: vi.fn(async () => true), onNotice: (n) => notices.push(n), random: () => 0, ...over };
  return { d, notices };
}

const sequence = (...outcomes: PutOutcome[]) => {
  const send = vi.fn(async (attempt: number) => outcomes[attempt - 1] ?? outcomes.at(-1)!);
  return send;
};

describe("تصنيف رد التخزين", () => {
  it("treats 2xx as stored", () => {
    expect(classifyPutResponse(200, "", 1).kind).toBe("ok");
    expect(classifyPutResponse(201, "", 3).kind).toBe("ok");
  });

  it.each([0, 408, 425, 429, 500, 502, 503, 504])("retries status %i", (status) => {
    expect(classifyPutResponse(status, "", 1).kind).toBe("retry");
  });

  it.each([400, 401, 403, 404, 413, 415])("does not retry an explicit refusal %i", (status) => {
    expect(classifyPutResponse(status, "{}", 2).kind).toBe("fatal");
  });

  it("never shows the storage provider's own text, and adds no status number", () => {
    for (const body of ['{"error":"Payload too large","message":"The object exceeded the maximum allowed size"}', '{"error":"الملف كبير"}', "<html>nginx</html>"]) {
      const out = classifyPutResponse(413, body, 1);
      expect(out).toMatchObject({ kind: "fatal" });
      expect((out as { message: string }).message).not.toMatch(/[a-z]|413/i);
    }
  });

  // الأبدان كما تعيدها Supabase Storage: الرمز الحقيقي داخل بدن HTTP 400
  const supabase = (statusCode: string, error: string, message: string) => JSON.stringify({ statusCode, error, message });

  it.each([
    ["429", "too_many_requests", "Too many requests"],
    ["500", "Internal", "Internal Server Error"],
    ["503", "DatabaseTimeout", "Timed out"],
    ["504", "DatabaseTimeout", "Gateway timeout"],
    ["408", "Timeout", "Request timeout"],
  ])("a refusal wrapped in HTTP 400 with code %s is retried", (code, error, message) => {
    expect(classifyPutResponse(400, supabase(code, error, message), 1).kind).toBe("retry");
  });

  it("a real too-large answer wrapped in 400 becomes an Arabic reason and is not retried", () => {
    const out = classifyPutResponse(400, supabase("413", "Payload too large", "The object exceeded the maximum allowed size"), 1);
    expect(out).toMatchObject({ kind: "fatal" });
    expect((out as { message: string }).message).toContain("حجم الملف");
    expect((out as { message: string }).message).not.toMatch(/[a-z]/i);
  });

  it("an expired upload link offers a fresh attempt", () => {
    expect(classifyPutResponse(400, supabase("400", "InvalidJWT", '"exp" claim timestamp check failed'), 1)).toMatchObject({ kind: "fatal", canRetry: true });
    expect(classifyPutResponse(400, supabase("403", "Unauthorized", "new row violates row-level security policy"), 1)).toMatchObject({ kind: "fatal", canRetry: true });
  });

  it("a wrong type gets its own Arabic reason", () => {
    const out = classifyPutResponse(400, supabase("415", "invalid_mime_type", "mime type application/x is not supported"), 1);
    expect((out as { message: string }).message).toContain("صيغة");
  });

  it("a duplicate on a retry means the earlier attempt landed and only its response was lost", () => {
    expect(classifyPutResponse(409, "{}", 2).kind).toBe("already_stored");
    expect(classifyPutResponse(400, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}', 2).kind).toBe("already_stored");
    expect(classifyPutResponse(400, "Asset Already Exists", 3).kind).toBe("already_stored");
  });

  it("a duplicate on the first attempt is a real refusal, keys are single use", () => {
    expect(classifyPutResponse(409, "{}", 1).kind).toBe("fatal");
    expect(classifyPutResponse(400, "Asset Already Exists", 1).kind).toBe("fatal");
  });

  it("a retry outcome carries no status number or provider text either", () => {
    expect(classifyPutResponse(503, "upstream connect error", 1)).toEqual({ kind: "retry", message: "تعذر الوصول إلى التخزين مؤقتًا" });
  });

  it("a plain 400 on a retry stays a refusal", () => {
    expect(classifyPutResponse(400, '{"error":"bad"}', 2).kind).toBe("fatal");
  });
});

describe("إعادة المحاولة", () => {
  it("stops at the first success", async () => {
    const { d, notices } = deps();
    const send = sequence({ kind: "ok" });
    await expect(putWithRetry(send, d)).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(notices).toEqual([]);
    expect(d.sleep).not.toHaveBeenCalled();
  });

  it("recovers from a transient failure and tells the user which attempt is running", async () => {
    const { d, notices } = deps();
    const send = sequence(networkFailure(), networkFailure(), { kind: "ok" });
    await expect(putWithRetry(send, d)).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(notices).toEqual([
      { reason: "retrying", attempt: 2, of: UPLOAD_RETRY.attempts },
      { reason: "retrying", attempt: 3, of: UPLOAD_RETRY.attempts },
    ]);
  });

  it("accepts a duplicate on retry as stored, the server verifies it at completion", async () => {
    const { d } = deps();
    await expect(putWithRetry(sequence(networkFailure(), { kind: "already_stored" }), d)).resolves.toEqual({ ok: true });
  });

  it("gives up after the attempts and offers a manual retry", async () => {
    const { d } = deps();
    const send = sequence(networkFailure());
    const res = await putWithRetry(send, d);
    expect(send).toHaveBeenCalledTimes(UPLOAD_RETRY.attempts);
    expect(res).toMatchObject({ ok: false, canRetry: true });
  });

  it("does not repeat a fatal refusal and offers no retry", async () => {
    const { d } = deps();
    const send = sequence({ kind: "fatal", message: "مرفوض" });
    await expect(putWithRetry(send, d)).resolves.toEqual({ ok: false, error: "مرفوض", canRetry: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("waits for the network when the phone is offline before spending an attempt", async () => {
    let offline = true;
    const waitForOnline = vi.fn(async () => {
      offline = false;
      return true;
    });
    const { d, notices } = deps({ isOffline: () => offline, waitForOnline });
    const send = sequence({ kind: "ok" });
    await expect(putWithRetry(send, d)).resolves.toEqual({ ok: true });
    expect(waitForOnline).toHaveBeenCalledWith(UPLOAD_RETRY.offlineWaitMs);
    expect(notices).toEqual([{ reason: "offline" }]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("hands control back when the network never returns", async () => {
    const { d } = deps({ isOffline: () => true, waitForOnline: async () => false });
    const send = sequence({ kind: "ok" });
    await expect(putWithRetry(send, d)).resolves.toMatchObject({ ok: false, canRetry: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("backs off and caps the delay", () => {
    expect(retryDelayMs(1, () => 1)).toBe(UPLOAD_RETRY.baseDelayMs);
    expect(retryDelayMs(2, () => 1)).toBe(UPLOAD_RETRY.baseDelayMs * 2);
    expect(retryDelayMs(30, () => 1)).toBe(UPLOAD_RETRY.maxDelayMs);
    expect(retryDelayMs(1, () => 0)).toBe(UPLOAD_RETRY.baseDelayMs * 0.75);
  });

  it("server calls repeat only on gateway failures, never on validation errors", () => {
    expect([502, 503, 504].every(isTransientServerStatus)).toBe(true);
    expect([200, 400, 401, 403, 404, 429, 500].some(isTransientServerStatus)).toBe(false);
  });
});
