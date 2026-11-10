import { describe, expect, it } from "vitest";
import { GATEWAY_REASONS, checkGatewayTarget, isGatewayPaymentPage, isLoopbackHost } from "@/server/payments/gateway-hosts";

const live = (baseUrl: string, appUrl = "https://farqad.com", vercel = true) => checkGatewayTarget({ environment: "live", baseUrl, appUrl, vercel });
const sandbox = (baseUrl: string, appUrl: string, vercel = false) => checkGatewayTarget({ environment: "sandbox", baseUrl, appUrl, vercel });

describe("where the gateway key may go", () => {
  it.each(["https://api.myfatoorah.com", "https://api-ae.myfatoorah.com", "https://api-sa.myfatoorah.com", "https://api-qa.myfatoorah.com", "https://api-eg.myfatoorah.com", "https://API.MyFatoorah.com/"])("live accepts the official host %s", (base) => {
    expect(live(base)).toMatchObject({ ok: true, simulator: false, origin: base.toLowerCase().replace(/\/$/, "") });
  });

  it.each([
    ["plain http", "http://api.myfatoorah.com"],
    ["a loopback simulator", "http://127.0.0.1:4010"],
    ["localhost over https", "https://localhost"],
    ["a look-alike domain", "https://api.myfatoorah.com.evil.example"],
    ["a suffix trick", "https://evilapi.myfatoorah.co"],
    ["a user-info trick", "https://api.myfatoorah.com@evil.example"],
    ["credentials on the real host", "https://user:pass@api.myfatoorah.com"],
    ["a custom port", "https://api.myfatoorah.com:8443"],
    ["a path", "https://api.myfatoorah.com/proxy"],
    ["a query", "https://api.myfatoorah.com/?x=1"],
    ["another subdomain of the gateway", "https://portal.myfatoorah.com"],
    ["the bare domain", "https://myfatoorah.com"],
    ["nonsense", "not a url"],
  ])("live refuses %s", (_label, base) => {
    expect(live(base).ok).toBe(false);
  });

  it("live never accepts the simulator exception, on any environment flag", () => {
    expect(live("http://127.0.0.1:4010", "http://localhost:3000", false).ok).toBe(false);
  });

  it("the test host in live mode is named as a mismatch", () => {
    expect(live("https://apitest.myfatoorah.com")).toMatchObject({ ok: false, reason: GATEWAY_REASONS.liveMismatch });
  });

  it("sandbox goes only to the official test host", () => {
    expect(sandbox("https://apitest.myfatoorah.com", "https://staging.farqad.com")).toMatchObject({ ok: true, simulator: false });
    expect(sandbox("https://api.myfatoorah.com", "https://staging.farqad.com")).toMatchObject({ ok: false, reason: GATEWAY_REASONS.sandboxMismatch });
    expect(sandbox("https://mock.example.com", "https://staging.farqad.com")).toMatchObject({ ok: false, reason: GATEWAY_REASONS.notOfficial });
    expect(sandbox("http://apitest.myfatoorah.com", "https://staging.farqad.com").ok).toBe(false);
  });

  describe("the simulator exception", () => {
    it.each(["http://127.0.0.1:4010", "http://localhost:4010", "http://[::1]:4010"])("sandbox off Vercel with a local APP_URL may use %s", (base) => {
      expect(sandbox(base, "http://localhost:3100")).toMatchObject({ ok: true, simulator: true });
    });
    it("not on any Vercel deployment", () => {
      expect(sandbox("http://127.0.0.1:4010", "http://localhost:3100", true).ok).toBe(false);
    });
    it("not with a real APP_URL", () => {
      expect(sandbox("http://127.0.0.1:4010", "https://farqad.com").ok).toBe(false);
    });
    it("not on a private LAN address or a host that only starts with 127", () => {
      expect(sandbox("http://192.168.1.5:4010", "http://localhost:3100").ok).toBe(false);
      expect(sandbox("http://10.0.0.1:4010", "http://localhost:3100").ok).toBe(false);
      expect(sandbox("http://127.evil.example:4010", "http://localhost:3100").ok).toBe(false);
    });
    it("not over a path that hides the origin", () => {
      expect(sandbox("http://127.0.0.1:4010/x", "http://localhost:3100").ok).toBe(false);
    });
  });
});

describe("APP_URL before payments can be enabled", () => {
  it.each([
    ["the default localhost", "http://localhost:3000"],
    ["plain http", "http://farqad.com"],
    ["https on localhost", "https://localhost:3000"],
    ["https on a loopback address", "https://127.0.0.1"],
    ["an IP address", "https://203.0.113.9"],
    ["a reserved test domain", "https://farqad.test"],
    ["an example domain", "https://farqad.example"],
    ["credentials in the address", "https://user:pw@farqad.com"],
  ])("live refuses %s", (_label, appUrl) => {
    expect(live("https://api.myfatoorah.com", appUrl)).toMatchObject({ ok: false, reason: GATEWAY_REASONS.appUrlLive });
  });

  it("live accepts a real https origin, including a vercel.app address the buyer can reach", () => {
    expect(live("https://api.myfatoorah.com", "https://farqad.com").ok).toBe(true);
    expect(live("https://api.myfatoorah.com", "https://darb-preview.vercel.app").ok).toBe(true);
  });

  it("sandbox through the real gateway needs https too", () => {
    expect(sandbox("https://apitest.myfatoorah.com", "http://localhost:3000")).toMatchObject({ ok: false, reason: GATEWAY_REASONS.appUrlSandbox });
    expect(sandbox("https://apitest.myfatoorah.com", "http://farqad.com")).toMatchObject({ ok: false, reason: GATEWAY_REASONS.appUrlSandbox });
  });
});

describe("the payment page address the gateway returns", () => {
  const onLive = { environment: "live" as const, simulatorOrigin: null };
  const onSandbox = { environment: "sandbox" as const, simulatorOrigin: null };

  it.each(["https://portal.myfatoorah.com/KWT/ie/0106", "https://kw.MyFatoorah.com/En/KWT/PayInvoice/Checkout?paymentId=1", "https://myfatoorah.com/x"])("live follows %s", (url) => {
    expect(isGatewayPaymentPage(url, onLive)).toBe(true);
  });

  it.each(["https://demo.myfatoorah.com/ie/0106230003434", "https://demo.MyFatoorah.com/Ar/KWT/PayInvoice/Checkout?invoiceKey=1"])("sandbox follows the documented test page %s", (url) => {
    expect(isGatewayPaymentPage(url, onSandbox)).toBe(true);
  });

  it("live refuses a test page", () => {
    expect(isGatewayPaymentPage("https://demo.myfatoorah.com/ie/1", onLive)).toBe(false);
    expect(isGatewayPaymentPage("https://apitest.myfatoorah.com/ie/1", onLive)).toBe(false);
  });

  it.each([
    ["http", "http://portal.myfatoorah.com/x"],
    ["a look-alike", "https://portal.myfatoorah.com.evil.example/x"],
    ["a suffix without a dot", "https://notmyfatoorah.com/x"],
    ["user-info", "https://portal.myfatoorah.com@evil.example/x"],
    ["credentials", "https://u:p@portal.myfatoorah.com/x"],
    ["a port", "https://portal.myfatoorah.com:8443/x"],
    ["a javascript url", "javascript:alert(1)"],
    ["a relative path", "/orders/1"],
    ["empty", ""],
    ["not a string", undefined],
    ["loopback without the simulator", "http://127.0.0.1:4010/pay/1"],
  ])("refuses %s", (_label, url) => {
    expect(isGatewayPaymentPage(url, onLive)).toBe(false);
    expect(isGatewayPaymentPage(url, onSandbox)).toBe(false);
  });

  it("with the simulator, only the simulator's own origin", () => {
    const sim = { environment: "sandbox" as const, simulatorOrigin: "http://127.0.0.1:4010" };
    expect(isGatewayPaymentPage("http://127.0.0.1:4010/pay/1", sim)).toBe(true);
    expect(isGatewayPaymentPage("http://127.0.0.1:9999/pay/1", sim)).toBe(false);
    expect(isGatewayPaymentPage("https://evil.example/pay/1", sim)).toBe(false);
  });
});

describe("isLoopbackHost", () => {
  it("is exact", () => {
    for (const h of ["localhost", "127.0.0.1", "127.1.2.3", "[::1]"]) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ["localhost.evil.example", "127.0.0.1.evil.example", "127.evil", "10.0.0.1"]) expect(isLoopbackHost(h)).toBe(false);
  });
});
