import "server-only";
import { sql } from "../db";

/** شجرة الهيكل الدراسي الكاملة للإدارة (تشمل المخفي) مع عدد المنتجات */
export type CatalogTree = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  is_published: boolean;
  grades: {
    id: string;
    slug: string;
    name: string;
    level: number;
    current_term: number;
    sort_order: number;
    is_published: boolean;
    product_count: number;
    subjects: { id: string; slug: string; name: string; icon: string; sort_order: number; is_published: boolean; product_count: number }[];
  }[];
}[];

export async function getCatalogTree(): Promise<CatalogTree> {
  const stages = await sql<{ id: string; slug: string; name: string; description: string; sort_order: number; is_published: boolean }[]>`
    select id, slug, name, description, sort_order, is_published from stages order by sort_order, name
  `;
  const grades = await sql<
    { id: string; stage_id: string; slug: string; name: string; level: number; current_term: number; sort_order: number; is_published: boolean; product_count: number }[]
  >`
    select g.id, g.stage_id, g.slug, g.name, g.level, g.current_term, g.sort_order, g.is_published,
      (select count(*)::int from products p where p.grade_id = g.id and p.status <> 'archived') as product_count
    from grades g order by g.sort_order, g.level
  `;
  const subjects = await sql<
    { id: string; grade_id: string; slug: string; name: string; icon: string; sort_order: number; is_published: boolean; product_count: number }[]
  >`
    select s.id, s.grade_id, s.slug, s.name, s.icon, s.sort_order, s.is_published,
      (select count(*)::int from products p where p.subject_id = s.id and p.status <> 'archived') as product_count
    from subjects s order by s.sort_order, s.name
  `;
  return stages.map((st) => ({
    ...st,
    grades: grades
      .filter((g) => g.stage_id === st.id)
      .map((g) => ({ ...g, subjects: subjects.filter((s) => s.grade_id === g.id) })),
  }));
}
