import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cartSignature } from "@/lib/cart-signature";
import { cartPageIsStale, getCartSnapshot, recordCart, registerHeaderStamp, resetCartStoreForTests, subscribeCart, visibleCartCount } from "@/components/site/cart-store";

beforeEach(resetCartStoreForTests);

describe("the cart number in the header", () => {
  it("shows what the server rendered until something is added", () => {
    registerHeaderStamp("render-1");
    expect(visibleCartCount(2, "render-1", getCartSnapshot())).toBe(2);
  });

  it("shows the new number at once after an add, without a new render", () => {
    registerHeaderStamp("render-1");
    recordCart(3, "a,b,c");
    expect(visibleCartCount(2, "render-1", getCartSnapshot())).toBe(3);
  });

  it("trusts any newer render from the server over the last add", () => {
    registerHeaderStamp("render-1");
    recordCart(3, "a,b,c");
    registerHeaderStamp("render-2");
    // حذف من صفحة السلة يعيد الرأس برقم أقل، حتى لو عاد مساويًا لرقم الرسم القديم
    expect(visibleCartCount(2, "render-2", getCartSnapshot())).toBe(2);
  });

  it("keeps the add when the same header comes back from the browser's memory", () => {
    registerHeaderStamp("render-1");
    recordCart(3, "a,b,c");
    registerHeaderStamp("render-1");
    expect(visibleCartCount(2, "render-1", getCartSnapshot())).toBe(3);
  });

  it("gives an add that beat the streamed header to the first header that arrives", () => {
    recordCart(1, "a");
    registerHeaderStamp("render-1");
    expect(visibleCartCount(0, "render-1", getCartSnapshot())).toBe(1);
  });

  it("tells subscribers about each change and stops when asked", () => {
    const listener = vi.fn();
    const off = subscribeCart(listener);
    recordCart(1, "a");
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    recordCart(2, "a,b");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("a saved copy of the cart page", () => {
  it("is fine when nothing was added in this tab", () => {
    expect(cartPageIsStale("a")).toBe(false);
  });

  it("asks for a fresh copy when it is older than the last add", () => {
    recordCart(2, "a,b");
    expect(cartPageIsStale("a")).toBe(true);
  });

  it("does not ask when normal navigation already brought the new cart", () => {
    recordCart(2, "a,b");
    expect(cartPageIsStale("a,b")).toBe(false);
  });

  it("asks only once, so a page that keeps disagreeing cannot loop", () => {
    recordCart(2, "a,b");
    expect(cartPageIsStale("a")).toBe(true);
    expect(cartPageIsStale("a")).toBe(false);
    expect(cartPageIsStale("zzz")).toBe(false);
  });

  it("uses one signature for both sides, whatever the order", () => {
    expect(cartSignature(["b", "a"])).toBe(cartSignature(["a", "b"]));
    expect(cartSignature([])).toBe("");
  });
});

describe("the button path does not render the page", () => {
  const button = readFileSync(join(__dirname, "../../src/components/site/add-to-cart.tsx"), "utf8");

  it("posts to the small route when JavaScript runs", () => {
    expect(button).toContain('fetch("/api/cart"');
    expect(button).toContain("event.preventDefault()");
  });

  it("keeps the server action for browsers without JavaScript", () => {
    expect(button.match(/<form action=\{action\}/g)).toHaveLength(2);
  });

  it("does not ask the router to redraw on success", () => {
    expect(button).not.toMatch(/router\.refresh|revalidatePath/);
  });
});
