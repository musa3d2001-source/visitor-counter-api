import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import * as staticInfo from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { config, proxy } from "@/proxy";
import nextConfig from "../../next.config";
import { API_CSP_SOURCE, SECURITY_HEADERS, STRICT_CSP } from "@/lib/security-headers";

/**
 * مطابقة proxy كما يبنيها Next نفسه من config.matcher (الدوال الداخلية نفسها التي يستعملها البناء)،
 * ورؤوس الأمان على ما لا يمر عليه proxy.
 */
type Matcher = Parameters<typeof getMiddlewareRouteMatcher>[0][number];
// الدالة التي يبني بها Next مطابقة proxy من config.matcher؛ مُصدّرة في JavaScript وغير معلنة في الأنواع
const { getMiddlewareMatchers } = staticInfo as unknown as { getMiddlewareMatchers: (matcher: unknown, config: unknown) => Matcher[] };
const matchers = getMiddlewareMatchers(config.matcher, { i18n: undefined });
const routeMatch = getMiddlewareRouteMatcher(matchers);

function runsProxy(path: string, headers: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  return routeMatch(path, { headers, cookies: {} } as never, Object.fromEntries(url.searchParams));
}

const PREFETCH = { "next-router-prefetch": "1" };

describe("proxy matcher", () => {
  it("runs on pages, including paths that merely start with api, media, brand or pdfjs", () => {
    for (const p of ["/", "/library", "/apix", "/apixyz/a", "/api-docs", "/mediax", "/media-x", "/brandnew", "/pdfjsx", "/favicon.icox", "/robots.txt.bak"]) {
      expect(runsProxy(p), p).toBe(true);
    }
  });

  it("skips API routes and static files", () => {
    for (const p of ["/api", "/api/", "/api/health", "/api/files/abc", "/media/a.png", "/brand/logo.svg", "/pdfjs/pdf.worker.mjs", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/sitemap.xml"]) {
      expect(runsProxy(p), p).toBe(false);
    }
  });

  it("runs on every admin request, prefetch included, so x-pathname is always the proxy's own", () => {
    for (const p of ["/admin", "/admin/orders", "/admin/settings/x"]) {
      expect(runsProxy(p, PREFETCH), p).toBe(true);
      expect(runsProxy(p, { purpose: "prefetch" }), p).toBe(true);
    }
    // صفحات الموقع العادية ما زالت تتجاوز proxy في التحميل المسبق
    expect(runsProxy("/library", PREFETCH)).toBe(false);
    // /adminx ليس لوحة الإدارة: صفحة عادية تتبع قاعدة الموقع
    expect(runsProxy("/adminx", PREFETCH)).toBe(false);
    expect(runsProxy("/adminx")).toBe(true);
  });
});

describe("proxy", () => {
  it("overwrites a client-sent x-pathname with the real path", () => {
    const req = new NextRequest("http://localhost/admin/settings", { headers: { "x-pathname": "/admin/products", cookie: "session=abc" } });
    const res = proxy(req);
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/admin/settings");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self' 'nonce-");
  });

  it("puts the security headers and a strict CSP on its login redirect", () => {
    const res = proxy(new NextRequest("http://localhost/admin/orders?x=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin%2Forders%3Fx%3D1");
    expect(res.headers.get("content-security-policy")).toBe(STRICT_CSP);
    for (const h of SECURITY_HEADERS) expect(res.headers.get(h.key), h.key).toBe(h.value);
  });

  it("treats /adminx and /libraryx as ordinary pages, not as session areas", () => {
    for (const p of ["/adminx", "/libraryx", "/accounts"]) {
      const res = proxy(new NextRequest(`http://localhost${p}`));
      expect(res.headers.get("location"), p).toBeNull();
      expect(res.headers.get("content-security-policy"), p).toContain("nonce-");
    }
  });
});

describe("next.config headers", () => {
  it("gives API responses a strict CSP, except the PDF delivery and the lesson video stream", async () => {
    const all = await nextConfig(PHASE_DEVELOPMENT_SERVER).headers!();
    const entry = all.find((h) => h.source === API_CSP_SOURCE);
    expect(entry?.headers).toEqual([{ key: "Content-Security-Policy", value: STRICT_CSP }]);
    const match = getPathMatch(API_CSP_SOURCE);
    for (const p of ["/api/", "/api/health", "/api/progress", "/api/lessons/x/progress", "/api/payments/myfatoorah/webhook", "/api/admin/reports/export"]) {
      expect(match(p), p).not.toBe(false);
    }
    for (const p of ["/api/files/abc", "/api/lessons/x/stream", "/apix"]) {
      expect(match(p), p).toBe(false);
    }
    const global = all.find((h) => h.source === "/:path*");
    expect(global?.headers).toEqual(SECURITY_HEADERS);
  });
});
