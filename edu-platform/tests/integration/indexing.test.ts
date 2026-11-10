import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/server/env";
import { PRIVATE_PATHS, siteIndexable } from "@/server/platform/indexing";
import { closeDb, resetDb } from "../helpers/db";
import { createProduct } from "../helpers/factories";
import { TEST_ENV } from "../test-env";

const { default: robots } = await import("@/app/robots");
const { default: sitemap } = await import("@/app/sitemap");
const { generateMetadata } = await import("@/app/layout");
const { metadata: homeMetadata } = await import("@/app/(site)/(home)/page");

beforeAll(resetDb);
afterAll(closeDb);
afterEach(() => {
  delete process.env.SITE_INDEXABLE;
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;
  resetEnvCache();
});

function deploy(appUrl: string, indexable?: string) {
  process.env.APP_URL = appUrl;
  if (indexable === undefined) delete process.env.SITE_INDEXABLE;
  else process.env.SITE_INDEXABLE = indexable;
  resetEnvCache();
}

describe("which deployments may be indexed", () => {
  it.each([
    ["https://farqad.example", undefined, true],
    ["https://farqad.example", "true", true],
    ["https://farqad.example", "", true],
    ["http://localhost:3000", undefined, true],
    ["https://farqad.example", "false", false],
    ["https://darb-launch.vercel.app", undefined, false],
    ["https://darb-launch-abc123-team.vercel.app/", undefined, false],
    ["https://DARB.VERCEL.APP", undefined, false],
    ["https://darb.vercel.app", "true", false],
    ["https://vercel.app", undefined, false],
    ["https://notvercel.app", undefined, true],
    ["https://vercel.app.farqad.example", undefined, true],
  ])("%s with SITE_INDEXABLE=%s: %s", (url, flag, expected) => {
    deploy(url, flag);
    expect(siteIndexable()).toBe(expected);
  });
});

describe("a deployment that must not be indexed", () => {
  const cases = [
    ["a vercel.app address", () => deploy("https://darb.vercel.app")],
    ["SITE_INDEXABLE=false", () => deploy("https://farqad.example", "false")],
  ] as const;

  describe.each(cases)("%s", (_name, setUp) => {
    it("robots.txt turns every crawler away and lists no sitemap", () => {
      setUp();
      const r = robots();
      expect(r.sitemap).toBeUndefined();
      const rules = [r.rules].flat();
      expect(rules.find((x) => x.userAgent === "*")).toEqual({ userAgent: "*", disallow: "/" });
    });

    it("the crawlers that honour noindex may fetch the page only to read it, and never the private paths", () => {
      setUp();
      const named = [robots().rules].flat().find((x) => Array.isArray(x.userAgent));
      expect(named?.userAgent).toEqual(["Googlebot", "Bingbot"]);
      expect(named?.disallow).toEqual(PRIVATE_PATHS);
    });

    it("the sitemap is empty", async () => {
      setUp();
      await createProduct({});
      await expect(sitemap()).resolves.toEqual([]);
    });

    it("every page says noindex, nofollow", async () => {
      setUp();
      expect((await generateMetadata()).robots).toEqual({ index: false, follow: false });
    });
  });
});

describe("a deployment on the real domain", () => {
  it("robots.txt allows the public site, keeps private paths out and lists the sitemap", () => {
    deploy("https://farqad.example/");
    const r = robots();
    expect(r.sitemap).toBe("https://farqad.example/sitemap.xml");
    expect([r.rules].flat()).toEqual([{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }]);
  });

  it("the sitemap lists real pages on the real domain", async () => {
    deploy("https://farqad.example");
    await createProduct({});
    const urls = (await sitemap()).map((x) => x.url);
    expect(urls).toContain("https://farqad.example/");
    expect(urls.some((u) => u.includes("/products/"))).toBe(true);
  });

  it("pages carry no robots restriction of their own", async () => {
    deploy("https://farqad.example");
    expect((await generateMetadata()).robots).toBeUndefined();
  });

  it("the canonical is relative to the configured domain, and set on the home page alone", async () => {
    deploy("https://farqad.example");
    expect(homeMetadata.alternates?.canonical).toBe("/");
    const root = await generateMetadata();
    expect(String(root.metadataBase)).toBe("https://farqad.example/");
    expect(root.alternates, "the root layout would hand it to every page").toBeUndefined();
  });
});
