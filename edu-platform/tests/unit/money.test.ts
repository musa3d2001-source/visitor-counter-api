import { describe, expect, it } from "vitest";
import { computeDiscount, filsToKwdString, formatKwd, kwdNumberToFils, parseKwdToFils } from "@/lib/money";

describe("money (fils)", () => {
  it("parses KWD strings to integer fils without float errors", () => {
    expect(parseKwdToFils("2.500")).toBe(2500);
    expect(parseKwdToFils("2.5")).toBe(2500);
    expect(parseKwdToFils("0.001")).toBe(1);
    expect(parseKwdToFils("10")).toBe(10000);
    expect(parseKwdToFils(" 3.25 ")).toBe(3250);
    expect(parseKwdToFils("0.1")).toBe(100);
    expect(parseKwdToFils("1234567.999")).toBe(1234567999);
  });

  it("accepts Arabic-Indic digits and Arabic decimal separator", () => {
    expect(parseKwdToFils("٢٫٥٠٠")).toBe(2500);
    expect(parseKwdToFils("١٠")).toBe(10000);
  });

  it("rejects invalid amounts", () => {
    for (const bad of ["", "abc", "-1", "1.2345", "1,5", "1e3", "12345678", ".5", "1."]) {
      expect(parseKwdToFils(bad), bad).toBeNull();
    }
  });

  it("formats fils as KWD with 3 decimals", () => {
    expect(filsToKwdString(0)).toBe("0.000");
    expect(filsToKwdString(1)).toBe("0.001");
    expect(filsToKwdString(2500)).toBe("2.500");
    expect(filsToKwdString(123456)).toBe("123.456");
    expect(filsToKwdString(-1500)).toBe("-1.500");
    expect(formatKwd(3000)).toBe("3.000 د.ك");
    expect(() => filsToKwdString(1.5)).toThrow();
  });

  it("converts gateway decimal values to fils with rounding", () => {
    expect(kwdNumberToFils(2.5)).toBe(2500);
    expect(kwdNumberToFils(0.1 + 0.2)).toBe(300);
    expect(kwdNumberToFils(10.942)).toBe(10942);
  });

  it("computes discounts safely", () => {
    expect(computeDiscount(10000, "percent", 10)).toBe(1000);
    expect(computeDiscount(3333, "percent", 10)).toBe(333); // يُقرَّب للأسفل
    expect(computeDiscount(10000, "percent", 100)).toBe(10000);
    expect(computeDiscount(2000, "fixed", 5000)).toBe(2000); // لا يتجاوز الإجمالي
    expect(computeDiscount(2000, "fixed", 500)).toBe(500);
    expect(computeDiscount(0, "percent", 50)).toBe(0);
  });
});
