import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/csv";

describe("csvCell", () => {
  it.each(["=1+1", "+96512345678", "-2", "@SUM(A1)", "\t=1", "\r=1", " =1", "‏=1", "﻿+1", "＝1", "＋1", "－1", "＠x"])("neutralises %j", (value) => {
    expect(csvCell(value).replace(/^"/, "")).toMatch(/^'/);
  });

  it("leaves ordinary values alone", () => {
    expect(csvCell("أحمد")).toBe('"أحمد"');
    expect(csvCell("a@b.com")).toBe('"a@b.com"');
    expect(csvCell("1.500")).toBe('"1.500"');
    expect(csvCell("")).toBe('""');
  });

  it("makes no exception for negatives: a leading minus becomes text too, still readable", () => {
    expect(csvCell(-1500)).toBe(`"'-1500"`);
    expect(csvCell(12)).toBe('"12"');
  });

  it("doubles quotes and keeps the cell closed across line breaks", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("joins cells with commas", () => {
    expect(csvRow(["a", 1, "=x"])).toBe(`"a","1","'=x"`);
  });
});
