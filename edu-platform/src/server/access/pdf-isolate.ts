import "server-only";
import { PDFArray, PDFContext, PDFDict, PDFDocument, PDFName, PDFObject, PDFPageLeaf, PDFRawStream, PDFRef, PDFStream, decodePDFRawStream } from "pdf-lib";

/**
 * عزل صفحات المعاينة المجانية عن بقية الملف.
 * نسخ صفحة بـ pdf-lib يتبع كل مرجع فيها: رابط فهرس يسحب الصفحة التي يشير إليها وبقية الشجرة معها،
 * وقاموس موارد مشترك يسحب صور كل الصفحات. فالمعاينة، وهي ملف عام بلا ختم، قد تحمل الكتاب كله.
 * لذلك: نترك في الصفحة ما يلزم عرضها فقط، ونبني لها موارد جديدة بما تسميه محتوياتها فعلًا،
 * ثم نفحص الملف الناتج بعد حفظه وإعادة فتحه. أي شك يوقف المعاينة ولا يُسلَّم الملف.
 */

/** المعاينة لم يثبت أنها معزولة. لا يعني أن الملف الرئيسي معيب، فلا يُعلَّم بسببه */
export class PreviewNotIsolatedError extends Error {
  constructor(reason: string) {
    super(`preview not isolated: ${reason}`);
    this.name = "PreviewNotIsolatedError";
  }
}

const name = (s: string) => PDFName.of(s);
const names = (list: readonly string[]) => new Set(list.map(name));

const CATEGORIES = ["Font", "XObject", "ExtGState", "ColorSpace", "Pattern", "Shading", "Properties"] as const;
type Category = (typeof CATEGORIES)[number];
type Uses = Record<Category, Set<PDFName>>;

const PAGE_KEYS = names(["Type", "Parent", "MediaBox", "CropBox", "Rotate", "Resources", "Contents", "Group", "UserUnit"]);
const FORM_KEYS = names(["Type", "Subtype", "FormType", "BBox", "Matrix", "Resources", "Group", "OC", "Length", "Filter", "DecodeParms"]);
const IMAGE_KEYS = names(["Type", "Subtype", "Width", "Height", "ColorSpace", "BitsPerComponent", "Mask", "SMask", "SMaskInData", "Matte", "Decode", "ImageMask", "Intent", "Interpolate", "OC", "Length", "Filter", "DecodeParms"]);
const PATTERN_KEYS = names(["Type", "PatternType", "PaintType", "TilingType", "BBox", "XStep", "YStep", "Matrix", "Resources", "Length", "Filter", "DecodeParms"]);
/** تُطبَّق دون أن يسميها المحتوى */
const IMPLICIT_COLOR_SPACES = names(["DefaultGray", "DefaultRGB", "DefaultCMYK"]);

const RESOURCES = name("Resources");
const SUBTYPE = name("Subtype");
const TYPE = name("Type");
const SMASK = name("SMask");
const MASK = name("Mask");

const emptyUses = (): Uses => ({ Font: new Set(), XObject: new Set(), ExtGState: new Set(), ColorSpace: new Set(), Pattern: new Set(), Shading: new Set(), Properties: new Set() });

function mergeUses(into: Uses, from: Uses) {
  for (const cat of CATEGORIES) for (const n of from[cat]) into[cat].add(n);
}

type Token = { kind: "name" | "word" | "string" | "open" | "close"; text: string };

const isWhite = (c: number) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32;
const isDelimiter = (c: number) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

/** يقرأ وحدات محتوى الصفحة. يكفيه أن يعرف حدود السلاسل والأسماء حتى لا يأخذ نصًا على أنه اسم مورد */
class ContentLexer {
  pos = 0;
  constructor(readonly bytes: Uint8Array) {}

  next(): Token | null {
    const b = this.bytes;
    for (;;) {
      while (this.pos < b.length && isWhite(b[this.pos])) this.pos++;
      if (this.pos < b.length && b[this.pos] === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
        continue;
      }
      break;
    }
    if (this.pos >= b.length) return null;
    const c = b[this.pos];
    if (c === 0x28) {
      this.skipLiteral();
      return { kind: "string", text: "" };
    }
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return { kind: "open", text: "<<" };
      }
      while (this.pos < b.length && b[this.pos] !== 0x3e) this.pos++;
      this.pos++;
      return { kind: "string", text: "" };
    }
    if (c === 0x3e) {
      this.pos += b[this.pos + 1] === 0x3e ? 2 : 1;
      return { kind: "close", text: ">>" };
    }
    if (c === 0x5b) {
      this.pos++;
      return { kind: "open", text: "[" };
    }
    if (c === 0x5d) {
      this.pos++;
      return { kind: "close", text: "]" };
    }
    if (c === 0x7b || c === 0x7d || c === 0x29) {
      this.pos++;
      return this.next();
    }
    const isName = c === 0x2f;
    if (isName) this.pos++;
    const start = this.pos;
    while (this.pos < b.length && !isWhite(b[this.pos]) && !isDelimiter(b[this.pos])) this.pos++;
    return { kind: isName ? "name" : "word", text: Buffer.from(b.buffer, b.byteOffset + start, this.pos - start).toString("latin1") };
  }

  private skipLiteral() {
    const b = this.bytes;
    let depth = 0;
    while (this.pos < b.length) {
      const c = b[this.pos++];
      if (c === 0x5c) this.pos++;
      else if (c === 0x28) depth++;
      else if (c === 0x29 && --depth === 0) return;
    }
  }

  /** الصورة المضمنة بيانات ثنائية قد تبدو أوامر، فنتخطاها كلها ونأخذ من رأسها اسم فضاء اللون فقط */
  skipInlineImage(uses: Uses) {
    let depth = 0;
    let previous: Token | null = null;
    for (;;) {
      const token = this.next();
      if (!token) return;
      if (token.kind === "open") depth++;
      else if (token.kind === "close") depth--;
      else if (depth === 0 && token.kind === "word" && token.text === "ID") break;
      else if (depth === 0 && token.kind === "name" && previous?.kind === "name" && (previous.text === "CS" || previous.text === "ColorSpace")) uses.ColorSpace.add(name(token.text));
      previous = token;
    }
    this.pos++;
    const b = this.bytes;
    for (let i = this.pos; i < b.length - 1; i++) {
      if (b[i] !== 0x45 || b[i + 1] !== 0x49) continue;
      if (i + 2 < b.length && !isWhite(b[i + 2])) continue;
      // «EI» قد تظهر داخل البيانات، وبعد النهاية الحقيقية لا يأتي إلا نص أوامر
      let textual = true;
      for (let j = i + 2; j < Math.min(b.length, i + 18); j++) if (!isWhite(b[j]) && (b[j] < 0x20 || b[j] > 0x7e)) textual = false;
      if (!textual) continue;
      this.pos = i + 2;
      return;
    }
    this.pos = b.length;
  }
}

/** أسماء الموارد التي تستخدمها أوامر هذا المحتوى، كل اسم في صنفه */
export function scanContent(bytes: Uint8Array): Uses {
  const uses = emptyUses();
  const lexer = new ContentLexer(bytes);
  let operands: (PDFName | null)[] = [];
  let depth = 0;
  const add = (cat: Category, operand: PDFName | null | undefined) => {
    if (operand) uses[cat].add(operand);
  };
  for (let token = lexer.next(); token; token = lexer.next()) {
    if (token.kind === "open") depth++;
    else if (token.kind === "close") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) operands.push(null);
    } else if (depth > 0) continue;
    else if (token.kind === "name") operands.push(name(token.text));
    else if (token.kind === "string") operands.push(null);
    else if (/^[+-]?[\d.]/.test(token.text) || token.text === "true" || token.text === "false" || token.text === "null") operands.push(null);
    else {
      const last = operands[operands.length - 1];
      if (token.text === "Do") add("XObject", last);
      else if (token.text === "Tf") add("Font", operands[operands.length - 2]);
      else if (token.text === "gs") add("ExtGState", last);
      else if (token.text === "cs" || token.text === "CS") add("ColorSpace", last);
      else if (token.text === "scn" || token.text === "SCN") add("Pattern", last);
      else if (token.text === "sh") add("Shading", last);
      else if (token.text === "BDC" || token.text === "DP") add("Properties", last);
      else if (token.text === "BI") lexer.skipInlineImage(uses);
      operands = [];
    }
  }
  return uses;
}

function decode(stream: PDFObject | undefined): Uint8Array {
  if (!(stream instanceof PDFRawStream)) throw new PreviewNotIsolatedError("content is not a stream");
  return decodePDFRawStream(stream).decode();
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
    out[at++] = 10;
  }
  return out;
}

function retain(dict: PDFDict, allowed: Set<PDFName>) {
  for (const key of dict.keys()) if (!allowed.has(key)) dict.delete(key);
}

type Walk = { context: PDFContext; clean: boolean; seen: Set<PDFObject>; legit: Set<PDFObject> };

function visitImage(walk: Walk, stream: PDFStream) {
  if (walk.legit.has(stream)) return;
  walk.legit.add(stream);
  if (walk.clean) retain(stream.dict, IMAGE_KEYS);
  for (const key of [SMASK, MASK]) {
    const mask = stream.dict.lookup(key);
    if (mask instanceof PDFStream) visitImage(walk, mask);
  }
}

/** ما له موارده ينقّيها لنفسه، وما بلا موارد يستعير موارد من استدعاه فتُضاف أسماؤه إليه */
function visitScoped(walk: Walk, holder: PDFDict, identity: PDFObject, content: Uint8Array, uses: Uses) {
  const own = holder.lookupMaybe(RESOURCES, PDFDict);
  if (!own) {
    mergeUses(uses, scanContent(content));
    return;
  }
  if (walk.seen.has(identity)) return;
  walk.seen.add(identity);
  const pruned = walkScope(walk, own, content);
  if (walk.clean && pruned) holder.set(RESOURCES, pruned);
}

function visitXObject(walk: Walk, value: PDFObject | undefined, uses: Uses) {
  if (!(value instanceof PDFStream)) throw new PreviewNotIsolatedError("xobject is not a stream");
  const subtype = value.dict.lookup(SUBTYPE);
  if (subtype === name("Image")) return visitImage(walk, value);
  if (subtype !== name("Form")) throw new PreviewNotIsolatedError("unsupported xobject");
  walk.legit.add(value);
  if (walk.clean) retain(value.dict, FORM_KEYS);
  visitScoped(walk, value.dict, value, decode(value), uses);
}

function visitGraphicsState(walk: Walk, value: PDFObject | undefined, uses: Uses) {
  if (!(value instanceof PDFDict)) return;
  const mask = value.lookup(SMASK);
  if (mask instanceof PDFDict) visitXObject(walk, mask.lookup(name("G")), uses);
}

function visitPattern(walk: Walk, value: PDFObject | undefined, uses: Uses) {
  if (value instanceof PDFStream) {
    if (walk.clean) retain(value.dict, PATTERN_KEYS);
    visitScoped(walk, value.dict, value, decode(value), uses);
  } else if (value instanceof PDFDict) {
    visitGraphicsState(walk, value.lookup(name("ExtGState")), uses);
  }
}

function visitFont(walk: Walk, value: PDFObject | undefined, uses: Uses) {
  if (!(value instanceof PDFDict) || value.lookup(SUBTYPE) !== name("Type3")) return;
  const procs = value.lookupMaybe(name("CharProcs"), PDFDict);
  if (!procs) return;
  visitScoped(walk, value, value, join(procs.values().map((p) => decode(walk.context.lookup(p)))), uses);
}

const VISITORS: Partial<Record<Category, (walk: Walk, value: PDFObject | undefined, uses: Uses) => void>> = {
  Font: visitFont,
  XObject: visitXObject,
  ExtGState: visitGraphicsState,
  Pattern: visitPattern,
};

/** خصائص المحتوى المعلَّم قد تحمل أي شيء. طبقات المحتوى لازمة للعرض، وما عداها يُفرَّغ */
function safeProperty(walk: Walk, raw: PDFObject): PDFObject {
  const value = walk.context.lookup(raw);
  const type = value instanceof PDFDict ? value.lookup(TYPE) : undefined;
  return type === name("OCG") || type === name("OCMD") ? raw : PDFDict.withContext(walk.context);
}

/**
 * يمر على ما تستخدمه محتويات نطاق واحد. عند التنقية يعيد قاموس موارد جديدًا لا يُلمس فيه الأصل،
 * فقد يكون مشتركًا بين كل صفحات الملف. وعند الفحص يرفض أي مورد لا يسميه المحتوى.
 */
function walkScope(walk: Walk, source: PDFDict | undefined, content: Uint8Array): PDFDict | undefined {
  const uses = scanContent(content);
  const handled = new Set<string>();
  // صيغة بلا موارد تضيف أسماء جديدة إلى هذا النطاق، فنعيد حتى لا يبقى جديد
  for (let again = true; again; ) {
    again = false;
    for (const cat of CATEGORIES) {
      const group = source?.lookupMaybe(name(cat), PDFDict);
      if (!group) continue;
      for (const n of [...uses[cat]]) {
        const id = `${cat}${n.asString()}`;
        if (handled.has(id)) continue;
        handled.add(id);
        again = true;
        VISITORS[cat]?.(walk, group.lookup(n), uses);
      }
    }
  }
  if (!source) return undefined;

  if (!walk.clean) {
    const known = names(CATEGORIES);
    for (const key of source.keys()) if (!known.has(key)) throw new PreviewNotIsolatedError("unexpected resource class");
    for (const cat of CATEGORIES) {
      const group = source.lookupMaybe(name(cat), PDFDict);
      if (!group) continue;
      for (const key of group.keys()) {
        if (!uses[cat].has(key) && !(cat === "ColorSpace" && IMPLICIT_COLOR_SPACES.has(key))) throw new PreviewNotIsolatedError(`unused ${cat} resource`);
      }
    }
    return source;
  }

  const pruned = PDFDict.withContext(walk.context);
  for (const cat of CATEGORIES) {
    const group = source.lookupMaybe(name(cat), PDFDict);
    if (!group) continue;
    const picked = PDFDict.withContext(walk.context);
    const wanted = cat === "ColorSpace" ? [...uses[cat], ...IMPLICIT_COLOR_SPACES] : [...uses[cat]];
    for (const n of wanted) {
      const raw = group.get(n);
      if (raw) picked.set(n, cat === "Properties" ? safeProperty(walk, raw) : raw);
    }
    if (picked.keys().length) pruned.set(name(cat), picked);
  }
  return pruned;
}

function pageContent(context: PDFContext, page: PDFPageLeaf): Uint8Array {
  const contents = page.Contents();
  if (!contents) return new Uint8Array();
  return join((contents instanceof PDFArray ? contents.asArray().map((o) => context.lookup(o)) : [contents]).map(decode));
}

/**
 * ينقّي صفحات المعاينة داخل نسخة الملف المحملة في الذاكرة، قبل نسخها.
 * هذه النسخة لا تُحفظ، فتعديل ما تشترك فيه الصفحات لا يصل إلى الملف الأصلي.
 */
export function isolatePages(context: PDFContext, pages: PDFPageLeaf[]) {
  const walk: Walk = { context, clean: true, seen: new Set(), legit: new Set() };
  for (const page of pages) {
    retain(page, PAGE_KEYS);
    const pruned = walkScope(walk, page.Resources(), pageContent(context, page));
    page.set(RESOURCES, pruned ?? PDFDict.withContext(context));
  }
}

function children(object: PDFObject): PDFObject[] {
  if (object instanceof PDFArray) return object.asArray();
  if (object instanceof PDFStream) return [object.dict];
  if (object instanceof PDFDict) return object.values();
  return [];
}

/**
 * الفحص الأخير، على الملف بعد حفظه وإعادة فتحه ومستقل عن خطوات التنقية:
 * عدد كائنات الصفحة يساوي عدد صفحات المعاينة، لا روابط، كل مورد يسميه محتوى مالكه،
 * وكل صورة أو صيغة مستخدمة فعلًا، ولا كائن يتيم يبقى في الملف بلا مرجع.
 */
export function assertIsolated(doc: PDFDocument, expectedPages: number) {
  const context = doc.context;
  const pages = doc.getPages();
  if (pages.length !== expectedPages) throw new PreviewNotIsolatedError("page tree count");

  const indirect = context.enumerateIndirectObjects();
  let pageObjects = 0;
  const inspect = (object: PDFObject) => {
    if (object instanceof PDFDict) {
      const type = object.lookup(TYPE);
      if (type === name("Annot") || object.has(name("Annots"))) throw new PreviewNotIsolatedError("annotation");
      if (type === name("Page") || object.has(name("Contents"))) pageObjects++;
    }
    for (const child of children(object)) inspect(child);
  };
  for (const [, object] of indirect) inspect(object);
  if (pageObjects !== expectedPages) throw new PreviewNotIsolatedError("page object count");

  const walk: Walk = { context, clean: false, seen: new Set(), legit: new Set() };
  for (const page of pages) {
    for (const key of page.node.keys()) if (!PAGE_KEYS.has(key)) throw new PreviewNotIsolatedError("unexpected page entry");
    walkScope(walk, page.node.Resources(), pageContent(context, page.node));
  }
  for (const [, object] of indirect) {
    if (!(object instanceof PDFStream)) continue;
    const subtype = object.dict.lookup(SUBTYPE);
    if ((subtype === name("Image") || subtype === name("Form")) && !walk.legit.has(object)) throw new PreviewNotIsolatedError("unused image or form");
  }

  const reached = new Set<PDFObject>();
  const pending: PDFObject[] = [context.trailerInfo.Root, context.trailerInfo.Info].filter((o): o is PDFObject => Boolean(o));
  while (pending.length) {
    const object = pending.pop()!;
    if (object instanceof PDFRef) {
      if (reached.has(object)) continue;
      reached.add(object);
      const target = context.lookup(object);
      if (target) pending.push(target);
    } else pending.push(...children(object));
  }
  for (const [ref] of indirect) if (!reached.has(ref)) throw new PreviewNotIsolatedError("unreferenced object");
}
