import { describe, expect, it } from "vitest";
import { FILE_NEEDS_REPAIR_MESSAGE, readerErrorMessage } from "@/lib/reader-error";

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
});
