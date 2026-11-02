import { describe, expect, it } from "vitest";
import { allocateProportional, computeEarningLines, computeOrderFee } from "@/server/commerce/earnings";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("allocateProportional (توزيع بدقة الفلس)", () => {
  it("sum of parts always equals the total", () => {
    for (const [total, weights] of [
      [700, [4000, 3000]],
      [1, [1, 1, 1]],
      [100, [3, 3, 3]],
      [999, [1234, 5678, 9, 1]],
      [258, [3600, 2700]],
    ] as [number, number[]][]) {
      const out = allocateProportional(total, weights);
      expect(sum(out)).toBe(total);
      expect(out.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    }
  });

  it("proportional with largest-remainder rounding", () => {
    expect(allocateProportional(700, [4000, 3000])).toEqual([400, 300]);
    expect(allocateProportional(258, [3600, 2700])).toEqual([147, 111]);
    // التعادل يُحسم بالترتيب
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("zero total, zero weights and empty input", () => {
    expect(allocateProportional(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProportional(50, [0, 0])).toEqual([0, 0]);
    expect(allocateProportional(50, [])).toEqual([]);
  });

  it("rejects negative or fractional totals", () => {
    expect(() => allocateProportional(-1, [1])).toThrow();
    expect(() => allocateProportional(1.5, [1])).toThrow();
  });
});

describe("computeOrderFee (الرسوم المعتمدة)", () => {
  it("percentage + fixed, rounded to the fils", () => {
    expect(computeOrderFee(6300, 250, 100)).toBe(158 + 100);
    expect(computeOrderFee(1000, 0, 0)).toBe(0);
  });
  it("never exceeds the order total; free orders have no fee", () => {
    expect(computeOrderFee(50, 0, 100)).toBe(50);
    expect(computeOrderFee(0, 250, 100)).toBe(0);
  });
});

describe("computeEarningLines", () => {
  it("discount and fee are allocated across items; teacher gets floor(net × share)", () => {
    const lines = computeEarningLines(
      [
        { orderItemId: "a", grossFils: 4000, shareBps: 4000 },
        { orderItemId: "b", grossFils: 3000, shareBps: null },
      ],
      700,
      258,
    );
    expect(lines[0]).toEqual({ orderItemId: "a", grossFils: 4000, discountFils: 400, feeFils: 147, netFils: 3453, shareBps: 4000, teacherFils: 1381, platformFils: 2072 });
    expect(lines[1]).toMatchObject({ discountFils: 300, feeFils: 111, netFils: 2589, teacherFils: 0, platformFils: 2589 });
    for (const l of lines) {
      expect(l.netFils).toBe(l.grossFils - l.discountFils - l.feeFils);
      expect(l.teacherFils + l.platformFils).toBe(l.netFils);
    }
    expect(sum(lines.map((l) => l.discountFils))).toBe(700);
    expect(sum(lines.map((l) => l.feeFils))).toBe(258);
  });

  it("100% discount → zero net, no fee, nothing for the teacher", () => {
    const lines = computeEarningLines([{ orderItemId: "a", grossFils: 5000, shareBps: 5000 }], 5000, 0);
    expect(lines[0]).toMatchObject({ discountFils: 5000, feeFils: 0, netFils: 0, teacherFils: 0, platformFils: 0 });
  });

  it("fee larger than the remaining amount is capped (net never negative)", () => {
    const lines = computeEarningLines([{ orderItemId: "a", grossFils: 1000, shareBps: 10000 }], 900, 500);
    expect(lines[0]).toMatchObject({ discountFils: 900, feeFils: 100, netFils: 0, teacherFils: 0 });
  });

  it("100% share gives the whole net to the teacher; 0% gives nothing", () => {
    const [full] = computeEarningLines([{ orderItemId: "a", grossFils: 3333, shareBps: 10000 }], 0, 0);
    expect(full).toMatchObject({ teacherFils: 3333, platformFils: 0 });
    const [none] = computeEarningLines([{ orderItemId: "a", grossFils: 3333, shareBps: 0 }], 0, 0);
    expect(none).toMatchObject({ teacherFils: 0, platformFils: 3333 });
  });
});
