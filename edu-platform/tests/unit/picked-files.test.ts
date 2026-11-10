import { describe, expect, it } from "vitest";
import { takePickedFiles } from "@/lib/picked-files";

/** حقل ملف كما يتصرف في المتصفح: تفريغ value يفرغ الملفات */
function fileInput(files: File[]) {
  const state = { files: files as File[] | null };
  return {
    get files() {
      return state.files;
    },
    get value() {
      return state.files?.length ? "C:\\fakepath\\x" : "";
    },
    set value(v: string) {
      if (v === "") state.files = [];
    },
  };
}

describe("a file picked before the page was ready", () => {
  const file = new File(["x"], "notes.pdf", { type: "application/pdf" });

  it("is handed over once and the field is left empty", () => {
    const input = fileInput([file]);
    expect(takePickedFiles(input)).toEqual([file]);
    expect(input.files).toEqual([]);
  });

  it("is not handed over twice, so a replayed change event uploads nothing more", () => {
    const input = fileInput([file]);
    takePickedFiles(input);
    expect(takePickedFiles(input)).toEqual([]);
  });

  it("asks nothing of a field that is empty or missing", () => {
    expect(takePickedFiles(fileInput([]))).toEqual([]);
    expect(takePickedFiles(null)).toEqual([]);
  });
});
