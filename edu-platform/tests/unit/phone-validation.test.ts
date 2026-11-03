import { describe, expect, it } from "vitest";
import { displayPhone, normalizeKuwaitPhone } from "@/lib/phone";
import { academicYearSchema, fieldErrors, loginSchema, priceSchema, registerSchema, slugSchema } from "@/lib/validation";
import { safeNextPath, slugify } from "@/lib/utils";

describe("Kuwait phone", () => {
  it("normalizes valid mobile numbers", () => {
    expect(normalizeKuwaitPhone("99887766")).toBe("+96599887766");
    expect(normalizeKuwaitPhone("+965 5123 4567")).toBe("+96551234567");
    expect(normalizeKuwaitPhone("00965-6612-3456")).toBe("+96566123456");
    expect(normalizeKuwaitPhone("٩٩٨٨٧٧٦٦")).toBe("+96599887766");
    expect(normalizeKuwaitPhone("41234567")).toBe("+96541234567");
  });
  it("rejects invalid numbers", () => {
    for (const bad of ["1234567", "123456789", "22345678", "abc", "+966551234567", ""]) {
      expect(normalizeKuwaitPhone(bad), bad).toBeNull();
    }
  });
  it("displays stored numbers", () => {
    expect(displayPhone("+96599887766")).toBe("9988 7766");
    expect(displayPhone(null)).toBe("");
  });
});

describe("validation schemas", () => {
  it("register: valid input normalizes email and phone", () => {
    const r = registerSchema.safeParse({ fullName: "  سارة أحمد ", email: " Sara@Example.COM ", password: "longpassword", phone: "99887766", gradeId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("sara@example.com");
      expect(r.data.fullName).toBe("سارة أحمد");
      expect(r.data.phone).toBe("+96599887766");
      expect(r.data.gradeId).toBeUndefined();
    }
  });
  it("register: rejects short password, bad email, bad phone, html in name", () => {
    const r = registerSchema.safeParse({ fullName: "<script>", email: "x", password: "short", phone: "123" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(Object.keys(errs).sort()).toEqual(["email", "fullName", "password", "phone"]);
      expect(errs.password).toContain("٨ أحرف");
    }
  });
  it("register: phone optional", () => {
    const r = registerSchema.safeParse({ fullName: "علي", email: "a@b.co", password: "12345678" });
    expect(r.success && r.data.phone).toBe(null);
  });
  it("login requires password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
  it("price schema returns fils", () => {
    expect(priceSchema.parse("2.750")).toBe(2750);
    expect(priceSchema.safeParse("2.7505").success).toBe(false);
  });
  it("slug and academic year", () => {
    expect(slugSchema.safeParse("grade-6").success).toBe(true);
    expect(slugSchema.safeParse("Grade 6").success).toBe(false);
    expect(slugSchema.safeParse("../etc").success).toBe(false);
    expect(academicYearSchema.safeParse("2026-2027").success).toBe(true);
    expect(academicYearSchema.safeParse("2026-2028").success).toBe(false);
  });
});

describe("utils", () => {
  it("safeNextPath blocks open redirects", () => {
    expect(safeNextPath("/library")).toBe("/library");
    expect(safeNextPath("/orders/1?x=2")).toBe("/orders/1?x=2");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNextPath(bad as string, "/"), String(bad)).toBe("/");
    }
  });
  it("slugify produces safe latin slugs", () => {
    expect(slugify("Grade 6 Math!")).toBe("grade-6-math");
    expect(slugify("مذكرة")).toBe("");
  });
});
