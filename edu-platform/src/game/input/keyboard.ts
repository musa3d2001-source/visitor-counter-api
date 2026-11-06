/**
 * لوحة المفاتيح (GAME_DESIGN.md §11): دالة نقية تحوّل المفتاح إلى أمر، فتُختبر بلا DOM وتستعملها Playwright.
 *  - ← و → للاتجاه، و ↑ و ↓ للارتفاع، و PageUp و PageDown للقوة (Shift يضاعف الخطوة ×5).
 *  - المسافة للإطلاق، و 1..4 للإجابة (code لا key: يعمل مع لوحة عربية وأرقام هندية).
 * المكوّن يتجاهل المفاتيح القادمة من حقل كتابة أو منزلق أو زر (هي تتولاها بنفسها) عبر targetHandlesKey.
 */
import { nudgeAim, type AimSteps } from "./aim";

export type KeyCommand = ({ type: "aim" } & AimSteps) | { type: "fire" } | { type: "answer"; choice: 0 | 1 | 2 | 3 };

export type KeyLike = { code?: string; key?: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean };

const BIG_STEP = 5;
const ANSWER_CODES: Record<string, 0 | 1 | 2 | 3> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
const ANSWER_KEYS: Record<string, 0 | 1 | 2 | 3> = { "1": 0, "2": 1, "3": 2, "4": 3, "١": 0, "٢": 1, "٣": 2, "٤": 3 };

/** الأمر المقابل للمفتاح، أو null إن لم يكن من مفاتيح اللعبة */
export function keyToCommand(e: KeyLike, aim: AimSteps): KeyCommand | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const code = e.code ?? "";
  const key = e.key ?? "";
  const step = e.shiftKey ? BIG_STEP : 1;
  const axis = (id: string): ["yaw" | "angle" | "power", number] | null => {
    switch (id) {
      case "ArrowRight":
        return ["yaw", step];
      case "ArrowLeft":
        return ["yaw", -step];
      case "ArrowUp":
        return ["angle", step];
      case "ArrowDown":
        return ["angle", -step];
      case "PageUp":
        return ["power", step];
      case "PageDown":
        return ["power", -step];
      default:
        return null;
    }
  };
  const move = axis(code) ?? axis(key);
  if (move) return { type: "aim", ...nudgeAim(aim, move[0], move[1]) };
  if (code === "Space" || key === " " || key === "Spacebar") return e.repeat ? null : { type: "fire" };
  const answer = ANSWER_CODES[code] ?? ANSWER_KEYS[key];
  if (answer !== undefined) return e.repeat ? null : { type: "answer", choice: answer };
  return null;
}

type KeyTarget = { tagName?: string; isContentEditable?: boolean; type?: string; getAttribute?: (n: string) => string | null };

const ARROWS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

/**
 * هل يتولى العنصر المركَّز هذا المفتاح بنفسه؟ فلا نكرر أثره:
 *  - حقول الكتابة والقوائم: كل المفاتيح.
 *  - المنزلق: الأسهم و PageUp/PageDown (المسافة والأرقام تبقى للعبة).
 *  - الزر والرابط: المسافة و Enter (والأسهم لأزرار الاختيار role="radio").
 */
export function targetHandlesKey(target: KeyTarget | null, e: KeyLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  const role = target.getAttribute?.("role") ?? "";
  const id = e.code || e.key || "";
  const isSpace = id === "Space" || e.key === " " || id === "Enter";
  if (tag === "TEXTAREA" || tag === "SELECT" || role === "textbox") return true;
  if (tag === "INPUT") {
    const type = (target.type ?? "text").toLowerCase();
    if (type === "range") return ARROWS.has(id);
    if (type === "checkbox" || type === "radio" || type === "button" || type === "submit") return isSpace || ARROWS.has(id);
    return true;
  }
  if (role === "slider") return ARROWS.has(id);
  if (role === "radio") return isSpace || ARROWS.has(id);
  if (tag === "BUTTON" || tag === "A" || role === "button") return isSpace;
  return false;
}
