import { describe, expect, it } from "vitest";
import { leavingPath, type LinkFacts } from "@/lib/nav-target";

const HERE = "https://farqad.test/grades/grade-7?tab=1";
const link = (href: string, extra: Partial<LinkFacts> = {}): LinkFacts => ({ href, download: false, role: null, target: "", ...extra });

describe("which links count as leaving the page", () => {
  it("an internal link to another page does", () => {
    expect(leavingPath(link("https://farqad.test/teachers"), HERE)).toBe("/teachers");
    expect(leavingPath(link("/products/a?x=1"), HERE)).toBe("/products/a?x=1");
  });

  it("the same page with other search parameters does", () => {
    expect(leavingPath(link("/grades/grade-7?tab=2"), HERE)).toBe("/grades/grade-7?tab=2");
  });

  it("a jump inside the page does not", () => {
    expect(leavingPath(link("/grades/grade-7?tab=1#faq"), HERE)).toBeNull();
    expect(leavingPath(link("#faq"), HERE)).toBeNull();
  });

  it("another site does not", () => {
    expect(leavingPath(link("https://wa.me/96500000000"), HERE)).toBeNull();
    expect(leavingPath(link("mailto:a@b.test"), HERE)).toBeNull();
  });

  it("routes that return a file or data never start the bar or a prefetch", () => {
    expect(leavingPath(link("/api/files/1?download=1"), HERE)).toBeNull();
    expect(leavingPath(link("/x.pdf", { download: true }), HERE)).toBeNull();
  });

  it("a tab, or a new window, does not leave this page", () => {
    expect(leavingPath(link("/grades/grade-8", { role: "tab" }), HERE)).toBeNull();
    expect(leavingPath(link("/grades/grade-8", { target: "_blank" }), HERE)).toBeNull();
    expect(leavingPath(link("/grades/grade-8", { target: "_self" }), HERE)).toBe("/grades/grade-8");
  });

  it("a broken address is ignored", () => {
    expect(leavingPath(link("http://"), HERE)).toBeNull();
  });
});
