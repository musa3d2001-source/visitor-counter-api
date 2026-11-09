import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PDF_PRODUCT_TYPES, PRODUCT_TYPES, VIDEO_PRODUCT_TYPES, isPdfType, isVideoType } from "@/lib/labels";

/**
 * كل نوع منتج مصنف مرة واحدة، وكل فحص للفيديو يقرأ من القائمة المعتمدة في labels.ts.
 * من يضيف نوعًا دون تصنيفه يفشل الاختبار الأول، ومن يكتب قائمة أنواع بيده في أي مكان يفشل الثاني،
 * وبذلك يصل أي نوع فيديو جديد تلقائيًا إلى النشر والسلة والدفع والصفحات.
 */
const SRC = resolve(__dirname, "../../src");
const CANONICAL = "lib/labels.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

/** مفتاح سجل النوع (video_lesson: "…") ليس قائمة، أما الحرفي المقتبس فهو ما نفتش عنه */
const LITERAL = new RegExp(`["'\`](${VIDEO_PRODUCT_TYPES.join("|")})["'\`]`, "g");
/** بين حرفيين من القائمة نفسها لا يوجد إلا فواصل وأقواس أو مقارنات، ولا ينتهي السطر البرمجي بينهما */
const JOINED = /^[\s,|&=!()[\]a-zA-Z_.?]*$/;

function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** أزواج من أنواع الفيديو مكتوبة معًا: قائمة مخفية تسقط منها الأنواع الجديدة */
export function hardCodedVideoLists(text: string): string[] {
  const code = codeOnly(text);
  const found = [...code.matchAll(LITERAL)];
  const lists: string[] = [];
  for (let i = 1; i < found.length; i++) {
    const a = found[i - 1];
    const b = found[i];
    if (a[1] === b[1]) continue;
    const between = code.slice(a.index + a[0].length, b.index);
    if (between.length <= 40 && JOINED.test(between)) lists.push(`${a[1]} + ${b[1]}`);
  }
  return lists;
}

/**
 * مجموعة «المراجعات» شكل عرض لنوعين محددين (التذكرة والعائلة اللونية)، وليست حارسًا على الفيديو:
 * النوع الجديد غير المذكور فيها يبقى فيديو عاديًا في كل فحص.
 */
const NOT_VIDEO_GUARDS: Record<string, string[]> = {
  "app/(site)/grades/_components/browse.tsx": ["quiz_review + exam_review"],
  "components/site/exam-ticket.tsx": ["exam_review + quiz_review"],
};

describe("every product type is classified", () => {
  it("each type is exactly one of PDF, video, or the bundle", () => {
    for (const type of PRODUCT_TYPES) {
      const kinds = [isPdfType(type), isVideoType(type), type === "bundle"].filter(Boolean);
      expect(kinds.length, `${type} must be exactly one of PDF, video, bundle`).toBe(1);
    }
  });

  it("the three groups together are exactly the product types", () => {
    expect([...PDF_PRODUCT_TYPES, ...VIDEO_PRODUCT_TYPES, "bundle"].sort()).toEqual([...PRODUCT_TYPES].sort());
  });

  it("the five video types of today are in the video list", () => {
    expect([...VIDEO_PRODUCT_TYPES].sort()).toEqual(["exam_review", "quiz_review", "unit", "video_course", "video_lesson"]);
  });
});

describe("no one keeps a private list of video types", () => {
  it("the detector sees the shapes such a list takes, and leaves records alone", () => {
    expect(hardCodedVideoLists(`const a = ["video_lesson", "unit"];`)).toEqual(["video_lesson + unit"]);
    expect(hardCodedVideoLists(`sql\`p.type in ('video_course', 'exam_review')\``)).toEqual(["video_course + exam_review"]);
    expect(hardCodedVideoLists(`if (t === "unit" || t === "quiz_review") x();`)).toEqual(["unit + quiz_review"]);
    expect(hardCodedVideoLists(`type T = "unit"\n  | "video_course";`)).toEqual(["unit + video_course"]);
    expect(hardCodedVideoLists(`const r = { video_lesson: "sky", unit: "sky" };`)).toEqual([]);
    expect(hardCodedVideoLists(`f("unit"); g("video_lesson");`)).toEqual([]);
    expect(hardCodedVideoLists(`// ["video_lesson", "unit"]`)).toEqual([]);
  });

  it("finds none in src outside the canonical file", () => {
    const offenders: Record<string, string[]> = {};
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
      if (rel === CANONICAL) continue;
      const lists = hardCodedVideoLists(readFileSync(file, "utf8")).filter((l) => !NOT_VIDEO_GUARDS[rel]?.includes(l));
      if (lists.length) offenders[rel] = lists;
    }
    expect(offenders, "use VIDEO_PRODUCT_TYPES or isVideoType from lib/labels.ts").toEqual({});
  });

  it("the file it allows still contains what it was allowed for", () => {
    for (const [rel, lists] of Object.entries(NOT_VIDEO_GUARDS)) {
      expect(hardCodedVideoLists(readFileSync(join(SRC, rel), "utf8")), rel).toEqual(expect.arrayContaining(lists));
    }
  });
});
