import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * stat هو مصدر حكم «الملف مفقود» الدائم، فلا يجوز أن يقول null إلا حين يقول التخزين ذلك صراحة.
 * انقطاع قصير كان يصف ملفًا سليمًا بأنه مفقود إلى الأبد.
 */
const mocks = vi.hoisted(() => ({ info: vi.fn(), fsStat: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ info: mocks.info }) } }),
}));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  return { ...real, default: real, stat: mocks.fsStat };
});

const { isNotFoundError, supabaseDriver } = await import("@/server/storage/supabase");
const { localDriver } = await import("@/server/storage/local");

const KEY = "products/a/b.pdf";
const fsError = (code: string) => Object.assign(new Error(code), { code });

afterEach(() => {
  mocks.info.mockReset();
  mocks.fsStat.mockReset();
});

describe("Supabase stat", () => {
  it("returns the size of a file that exists", async () => {
    mocks.info.mockResolvedValue({ data: { size: 1234 }, error: null });
    await expect(supabaseDriver.stat("private", KEY)).resolves.toEqual({ size: 1234 });
  });

  it.each([
    ["HTTP 404", { status: 404, message: "Object not found" }],
    ["HTTP 400 with statusCode 404 in the body", { status: 400, statusCode: "404", message: "Object not found" }],
  ])("reports a missing file only on an explicit answer: %s", async (_name, error) => {
    mocks.info.mockResolvedValue({ data: null, error });
    await expect(supabaseDriver.stat("private", KEY)).resolves.toBeNull();
  });

  it.each([
    ["a gateway failure", { status: 503, message: "Service Unavailable" }],
    ["a timeout", { status: 504, message: "Gateway Timeout" }],
    ["a network drop with no status", { message: "fetch failed" }],
    ["a permission refusal", { status: 403, statusCode: "403", message: "Forbidden" }],
    ["an HTTP 400 that is not a 404", { status: 400, statusCode: "500", message: "Internal" }],
  ])("throws instead of calling the file missing: %s", async (_name, error) => {
    mocks.info.mockResolvedValue({ data: null, error });
    await expect(supabaseDriver.stat("private", KEY)).rejects.toThrow(/storage stat failed/);
  });

  it("throws on an empty answer with no error", async () => {
    mocks.info.mockResolvedValue({ data: null, error: null });
    await expect(supabaseDriver.stat("private", KEY)).rejects.toThrow(/empty response/);
  });

  it("isNotFoundError accepts both shapes and nothing else", () => {
    expect(isNotFoundError({ status: 404 })).toBe(true);
    expect(isNotFoundError({ statusCode: "404" })).toBe(true);
    expect(isNotFoundError({ statusCode: 404 })).toBe(true);
    expect(isNotFoundError({ status: 400 })).toBe(false);
    expect(isNotFoundError({})).toBe(false);
  });
});

describe("local disk stat", () => {
  it.each(["ENOENT", "ENOTDIR"])("%s means the file is not there", async (code) => {
    mocks.fsStat.mockRejectedValue(fsError(code));
    await expect(localDriver.stat("private", KEY)).resolves.toBeNull();
  });

  it.each(["EACCES", "EIO", "EMFILE"])("%s is a disk failure, not a missing file", async (code) => {
    mocks.fsStat.mockRejectedValue(fsError(code));
    await expect(localDriver.stat("private", KEY)).rejects.toThrow(code);
  });
});
