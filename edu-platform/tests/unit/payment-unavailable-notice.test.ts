import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentUnavailableNotice, realContactLinks } from "@/components/site/payment-unavailable-notice";

const none = { whatsapp_number: "", contact_email: "", contact_phone: "" };
const html = (settings: typeof none) => renderToStaticMarkup(createElement(PaymentUnavailableNotice, { settings }));

describe("message when online payment is off", () => {
  it("offers every real contact channel that is set", () => {
    const out = html({ whatsapp_number: "+965 9988-7766".replace(/[ -]/g, ""), contact_email: "help@farqad.example", contact_phone: "+965 2222 3333" });
    expect(out).toContain('href="https://wa.me/96599887766"');
    expect(out).toContain('href="mailto:help@farqad.example"');
    expect(out).toContain('href="tel:+96522223333"');
    expect(out).toContain("للاستفسار عن شراء هذا المحتوى تواصل معنا");
  });

  it("offers only the channels that exist", () => {
    expect(realContactLinks({ ...none, contact_email: "help@farqad.example" }).map((l) => l.key)).toEqual(["mail"]);
    const out = html({ ...none, contact_email: "help@farqad.example" });
    expect(out).toContain("mailto:");
    expect(out).not.toContain("wa.me");
    expect(out).not.toContain("tel:");
  });

  it("with nothing set, it links nowhere and says what is true", () => {
    const out = html(none);
    expect(out).not.toContain("<a");
    expect(out).toContain("تبقى المنتجات في سلتك");
  });

  it("does not promise that contacting us completes the order", () => {
    expect(html({ ...none, whatsapp_number: "+96599887766" })).not.toContain("لإتمام طلبك");
  });
});
