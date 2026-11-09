import { describe, expect, it } from "vitest";
import { maxPreviewPages, PREVIEW_ISSUE_FIX, PREVIEW_POLICY, previewIssue, previewWithinPolicy } from "@/lib/preview-policy";

describe("قاعدة المعاينة الواحدة", () => {
  it.each([
    [1, 0],
    [2, 0],
    [4, 0],
    [5, 1],
    [9, 1],
    [10, 2],
    [14, 2],
    [15, 3],
    [49, 9],
    [50, 10],
    [51, 10],
    [5000, 10],
  ])("file of %i pages allows %i preview pages", (total, allowed) => {
    expect(maxPreviewPages(total)).toBe(allowed);
  });

  it("never reaches the whole file, for any length", () => {
    for (let total = 1; total <= 2000; total++) {
      const allowed = maxPreviewPages(total);
      expect(allowed).toBeLessThan(total);
      expect(allowed).toBeLessThanOrEqual(PREVIEW_POLICY.maxPages);
    }
  });

  it.each([null, undefined, 0, -3, 2.5, Number.NaN])("unknown length %s allows nothing", (total) => {
    expect(maxPreviewPages(total as number)).toBe(0);
  });

  it("previewWithinPolicy fails closed", () => {
    expect(previewWithinPolicy(1, 5)).toBe(true);
    expect(previewWithinPolicy(2, 5)).toBe(false);
    expect(previewWithinPolicy(1, null)).toBe(false);
    expect(previewWithinPolicy(null, 50)).toBe(false);
    expect(previewWithinPolicy(0, 50)).toBe(false);
  });
});

describe("سبب إخفاء المعاينة", () => {
  const main = { id: "m1", page_count: 10, check_status: "ok" };
  const preview = { page_count: 2, check_status: "ok", source_file_id: "m1", pages_isolated: true };

  it("is null for a preview made for the current first file and within the rule", () => {
    expect(previewIssue(preview, main)).toBeNull();
    expect(previewIssue({ ...preview, check_status: "unchecked" }, { ...main, check_status: "unchecked" })).toBeNull();
  });

  it("reports a preview made for a replaced file, or for no file", () => {
    expect(previewIssue({ ...preview, source_file_id: "m0" }, main)).toBe("stale");
    expect(previewIssue({ ...preview, source_file_id: null }, main)).toBe("stale");
    expect(previewIssue(preview, undefined)).toBe("stale");
  });

  it("tells the owner to replace the main file when that is the real problem", () => {
    expect(PREVIEW_ISSUE_FIX.flagged).toContain("الملف الرئيسي");
    expect(PREVIEW_ISSUE_FIX.flagged).not.toContain("أعد التوليد");
  });

  it("reports a preview that was never proven isolated from the rest of the file", () => {
    expect(previewIssue({ ...preview, pages_isolated: false }, main)).toBe("not_isolated");
  });

  it("reports a preview that is too long or attached to a broken file", () => {
    expect(previewIssue({ ...preview, page_count: 3 }, main)).toBe("too_long");
    expect(previewIssue(preview, { ...main, check_status: "encrypted" })).toBe("flagged");
    expect(previewIssue({ ...preview, check_status: "corrupt" }, main)).toBe("flagged");
  });
});
