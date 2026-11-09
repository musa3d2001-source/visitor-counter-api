import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/server/catalog/queries";
import { env } from "@/server/env";
import { siteIndexable } from "@/server/platform/indexing";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!siteIndexable()) return [];
  const base = env().APP_URL.replace(/\/$/, "");
  const { products, grades, subjects, stages, teachers } = await sitemapEntries();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/bundles`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/teachers`, changeFrequency: "weekly", priority: 0.8 },
    ...teachers.map((t) => ({ url: `${base}/teachers/${t.slug}`, lastModified: t.updated_at, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...stages.filter((s) => s.grades.length).map((s) => ({ url: `${base}/stages/${s.slug}`, priority: 0.7 })),
    ...grades.map((g) => ({ url: `${base}/grades/${g.slug}`, changeFrequency: "daily" as const, priority: 0.9 })),
    ...subjects.map((s) => ({ url: `${base}/grades/${s.grade_slug}/${s.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.updated_at, priority: 0.8 })),
    ...["terms", "privacy", "refund-policy", "copyright", "contact"].map((p) => ({ url: `${base}/${p}`, priority: 0.3 })),
  ];
}
