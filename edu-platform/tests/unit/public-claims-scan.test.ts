import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AFTER_CONFIRM, PAYMENT_CLAIM } from "@/lib/site-truth";

/**
 * كل ادعاء عن الدفع يأتي من site-truth حسب حال الدفع الفعلية. هذا الاختبار يفشل إن كتبت صفحة عامة ادعاءً بيدها.
 * صفحات المستندات القانونية مستثناة: تسمّي بوابة الدفع كجهة تعالج البيانات، وليس وعدًا بالدفع، ولها اختبارها.
 */
const SRC = resolve(__dirname, "../../src");
const ROOTS = ["app/(site)", "app/(reader)", "app/payment", "components/site", "components/reader", "app/layout.tsx", "app/not-found.tsx", "server/platform/settings.ts"];
const LEGAL = ["app/(site)/terms/", "app/(site)/privacy/", "app/(site)/refund-policy/", "app/(site)/copyright/"];

function walk(path: string): string[] {
  if (statSync(path).isFile()) return /\.tsx?$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => walk(join(path, name)));
}

const files = ROOTS.flatMap((r) => walk(join(SRC, r))).map((f) => relative(SRC, f).replace(/\\/g, "/"));
const scanned = files.filter((f) => !LEGAL.some((l) => f.startsWith(l)));

/** التعليقات وأسطر الاستيراد ليست نصًا يراه الزائر */
const visibleCode = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?$/gm, " ");

/** اسم دالة أو مسار أو قيمة قاعدة بيانات (MyFatoorahError، /api/payments/myfatoorah، 'myfatoorah') ليس ادعاءً: الاسم اللاتيني يحسب فقط بحروفه الكبيرة وواقفًا وحده */
function claimsIn(source: string): string[] {
  const code = visibleCode(source);
  const out: string[] = [];
  for (const m of code.matchAll(new RegExp(PAYMENT_CLAIM.source, "gi"))) {
    const isLatin = /^[a-z]/i.test(m[0]);
    const before = code[m.index - 1] ?? "";
    const after = code[m.index + m[0].length] ?? "";
    if (isLatin && (m[0] === m[0].toLowerCase() || /[\w/$.-]/.test(before) || /[\w/$.-]/.test(after))) continue;
    out.push(m[0]);
  }
  return out;
}

describe("no public page hard-codes a payment claim", () => {
  it("covers the pages that used to carry one", () => {
    for (const f of ["app/(site)/_home/hero.tsx", "app/(site)/_home/sections.tsx", "components/site/footer.tsx", "components/site/auth-card.tsx", "app/(site)/(auth)/_components/auth-bits.tsx", "app/(site)/products/[slug]/page.tsx", "app/(site)/products/[slug]/video-view.tsx", "app/(site)/cart/_components/commerce.tsx", "app/(site)/checkout/page.tsx", "app/(site)/checkout/checkout-form.tsx", "components/site/sandbox-banner.tsx", "server/platform/settings.ts"]) {
      expect(scanned, f).toContain(f);
    }
  });

  it.each(scanned)("%s", (file) => {
    expect(claimsIn(readFileSync(join(SRC, file), "utf8"))).toEqual([]);
  });
});

/** «يظهر بعد تأكيد الدفع» كذب حين يتوقف الدفع، فيأتي من libraryNote أو productLibraryLine حسب الحال، ولا يُكتب في صفحة */
describe("no public page hard-codes 'after payment confirmation'", () => {
  it("covers the pages that used to carry it", () => {
    for (const f of ["components/reader/pdf-reader.tsx", "app/(reader)/watch/[productId]/page.tsx", "app/(site)/contact/page.tsx", "app/(site)/library/page.tsx", "app/(site)/cart/page.tsx", "app/(site)/_home/sections.tsx"]) {
      expect(scanned, f).toContain(f);
    }
  });

  it.each(scanned)("%s", (file) => {
    expect(visibleCode(readFileSync(join(SRC, file), "utf8")).match(new RegExp(AFTER_CONFIRM.source, "g")) ?? []).toEqual([]);
  });
});

describe("the scan itself", () => {
  it("catches a claim in JSX text and in a string", () => {
    expect(claimsIn(`<li>دفع آمن بكي نت</li>`).length).toBeGreaterThan(0);
    expect(claimsIn(`const x = "عبر ماي فاتورة";`)).toEqual(["ماي فاتورة"]);
    expect(claimsIn(`<b>MyFatoorah</b>`)).toEqual(["MyFatoorah"]);
  });

  it("ignores comments, imports and identifiers", () => {
    expect(claimsIn(`/** عبر ماي فاتورة */ const a = 1;`)).toEqual([]);
    expect(claimsIn(`// كي نت`)).toEqual([]);
    expect(claimsIn(`import { MyFatoorahError } from "@/server/payments/myfatoorah";`)).toEqual([]);
    expect(claimsIn(`throw new MyFatoorahError("x"); fetch("/api/payments/myfatoorah/webhook"); const g = 'myfatoorah';`)).toEqual([]);
  });
});
