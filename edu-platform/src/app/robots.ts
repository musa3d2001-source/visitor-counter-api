import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/library", "/read/", "/preview/", "/watch/", "/account", "/orders/", "/checkout", "/cart", "/payment/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
