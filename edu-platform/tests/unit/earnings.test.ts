import { describe, expect, it } from "vitest";
import { allocateProportional, computeEarningLines, computeOrderFee, expandLine } from "@/server/commerce/earnings";

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

  it("rejects negative or fractional weights", () => {
    expect(() => allocateProportional(10, [1, -1])).toThrow();
    expect(() => allocateProportional(10, [1.5, 1])).toThrow();
  });

  it("a remainder tie is settled by position, exactly, without float noise", () => {
    // الباقي بالضبط 2 و2 و... كل وزن 4 أو 1: الكسور العشرية كانت تعطي [1, 1, 1]
    expect(allocateProportional(3, [4, 1, 4])).toEqual([2, 0, 1]);
    expect(allocateProportional(5, [3, 3, 3, 3, 3, 3])).toEqual([1, 1, 1, 1, 1, 0]);
    expect(allocateProportional(1, [7, 7, 7])).toEqual([1, 0, 0]);
  });

  it("a zero weight never receives a fils", () => {
    expect(allocateProportional(1001, [0, 1000, 0, 2000, 3000])).toEqual([0, 167, 0, 334, 500]);
    expect(allocateProportional(2, [0, 3, 3])).toEqual([0, 1, 1]);
  });

  it("large fils values stay exact", () => {
    const big = 2_000_000_000;
    const out = allocateProportional(big, [big, big - 1, 3]);
    expect(sum(out)).toBe(big);
    expect(out.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
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

describe("expandLine (توزيع الباقة على محتوياتها)", () => {
  const T1 = { id: "t1", name: "أ", shareBps: 5000 };
  const node = (id: string, type: string, price: number, teacher: typeof T1 | null = null) => ({
    id,
    type,
    title: id,
    price_fils: price,
    teacher_id: teacher?.id ?? null,
    teacher_name: teacher?.name ?? null,
    share_bps: teacher?.shareBps ?? null,
  });
  const T2 = { id: "t2", name: "ب", shareBps: 3000 };
  const map = (...ns: ReturnType<typeof node>[]) => new Map(ns.map((n) => [n.id, n]));

  it("splits a bundle by list price, largest remainder, in stored order", () => {
    const parts = expandLine("b", 1001, null, new Map([["b", ["x", "y", "z"]]]), map(node("b", "bundle", 1001), node("x", "pdf", 1000, T1), node("y", "pdf", 2000, T2), node("z", "pdf", 3000)));
    expect(parts!.map((p) => [p.productId, p.grossFils, p.owner?.id ?? null])).toEqual([
      ["x", 167, "t1"],
      ["y", 334, "t2"],
      ["z", 500, null],
    ]);
  });

  it("a three-way remainder tie goes to the first item in order", () => {
    const parts = expandLine("b", 100, null, new Map([["b", ["x", "y", "z"]]]), map(node("b", "bundle", 100), node("x", "pdf", 500, T1), node("y", "pdf", 500, T1), node("z", "pdf", 500, T2)));
    expect(parts!.map((p) => p.grossFils)).toEqual([34, 33, 33]);
  });

  it("a zero-priced item takes nothing but stays listed", () => {
    const parts = expandLine("b", 700, null, new Map([["b", ["x", "free"]]]), map(node("b", "bundle", 700), node("x", "pdf", 900, T1), node("free", "pdf", 0, T2)));
    expect(parts!.map((p) => [p.productId, p.grossFils])).toEqual([
      ["x", 700],
      ["free", 0],
    ]);
  });

  it("a bundle whose items are all zero-priced has no basis to split", () => {
    expect(expandLine("b", 700, null, new Map([["b", ["x"]]]), map(node("b", "bundle", 700), node("x", "pdf", 0, T1)))).toBeNull();
  });

  it("a plain product is not split", () => {
    expect(expandLine("x", 700, T1, new Map(), map(node("x", "pdf", 700, T1)))).toBeNull();
  });

  it("a one-teacher course stays one line; its units are not separate sales", () => {
    const kids = new Map([["c", ["u1", "u2"]]]);
    expect(expandLine("c", 900, T1, kids, map(node("c", "video_course", 900, T1), node("u1", "unit", 500, T1), node("u2", "unit", 500)))).toBeNull();
  });

  it("a course that holds another teacher's unit splits, and its teacherless unit follows the course teacher", () => {
    const kids = new Map([["c", ["u1", "u2", "u3"]]]);
    const parts = expandLine("c", 900, T1, kids, map(node("c", "video_course", 900, T1), node("u1", "unit", 300, T1), node("u2", "unit", 300, T2), node("u3", "unit", 300)));
    expect(parts!.map((p) => [p.productId, p.grossFils, p.owner?.id])).toEqual([
      ["u1", 300, "t1"],
      ["u2", 300, "t2"],
      ["u3", 300, "t1"],
    ]);
  });

  it("a nested course inside a bundle splits on the direct prices first and the parts still add up", () => {
    const kids = new Map([
      ["b", ["c", "n"]],
      ["c", ["u1", "u2"]],
    ]);
    const parts = expandLine("b", 1000, null, kids, map(node("b", "bundle", 1000), node("c", "video_course", 2000, T1), node("n", "pdf", 1000), node("u1", "unit", 1500, T1), node("u2", "unit", 1500, T2)));
    expect(parts!.map((p) => [p.productId, p.grossFils])).toEqual([
      ["u1", 334],
      ["u2", 333],
      ["n", 333],
    ]);
    expect(sum(parts!.map((p) => p.grossFils))).toBe(1000);
  });

  it("the same item reached twice is one part with the summed amount", () => {
    const kids = new Map([
      ["b", ["c", "u"]],
      ["c", ["u", "v"]],
    ]);
    const parts = expandLine("b", 300, null, kids, map(node("b", "bundle", 300), node("c", "video_course", 100, T1), node("u", "unit", 100, T2), node("v", "unit", 100, T1)));
    expect(sum(parts!.map((p) => p.grossFils))).toBe(300);
    expect(parts!.filter((p) => p.productId === "u")).toHaveLength(1);
  });
});
