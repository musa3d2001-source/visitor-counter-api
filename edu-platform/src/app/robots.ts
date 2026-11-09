import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { PRIVATE_PATHS, siteIndexable } from "@/server/platform/indexing";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!siteIndexable()) {
    return {
      rules: [
        { userAgent: "*", disallow: "/" },
        // Google وBing لا يقرآن noindex في صفحة مُنع زحفها، وقد يفهرسان رابطها العاري. يُسمح لهما بقراءة المنع نفسه
        // https://developers.google.com/search/docs/crawling-indexing/block-indexing
        { userAgent: ["Googlebot", "Bingbot"], allow: "/", disallow: PRIVATE_PATHS },
      ],
    };
  }
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${base}/sitemap.xml`,
  };
}
