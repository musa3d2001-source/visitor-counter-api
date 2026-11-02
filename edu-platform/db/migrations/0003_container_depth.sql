-- =====================================================================
-- 0003: إصلاح حد عمق الحاويات
-- 0002 كان يقيس عمق العنصر المضاف فقط؛ الصحيح: (عمق الحاوية من الأعلى) + (عمق العنصر) ≤ 4
-- مثال مسموح: باقة ← دورة ← وحدة ← درس منفرد (4 مستويات)
-- =====================================================================
create or replace function check_bundle_item() returns trigger
language plpgsql as $$
declare
  b_type text;
  cyc boolean;
  item_depth integer;
  anc_depth integer;
begin
  select type into b_type from products where id = new.bundle_id;
  if b_type is null or b_type not in ('bundle', 'video_course', 'unit') then
    raise exception 'container must be a bundle, video_course or unit';
  end if;

  -- منع الحلقات: هل يمكن الوصول من العنصر الجديد إلى الحاوية؟
  with recursive r(id) as (
    select new.product_id
    union
    select bi.product_id from bundle_items bi join r on bi.bundle_id = r.id
  )
  select exists (select 1 from r where id = new.bundle_id) into cyc;
  if cyc then
    raise exception 'bundle cycle detected';
  end if;

  -- عمق شجرة العنصر المضاف (العنصر نفسه = 1)
  with recursive d(id, lvl) as (
    select new.product_id, 1
    union all
    select bi.product_id, d.lvl + 1 from bundle_items bi join d on bi.bundle_id = d.id where d.lvl < 10
  )
  select max(lvl) into item_depth from d;

  -- عمق الحاوية من الأعلى (الحاوية نفسها = 1، ونأخذ أطول سلسلة آباء)
  with recursive a(id, lvl) as (
    select new.bundle_id, 1
    union all
    select bi.bundle_id, a.lvl + 1 from bundle_items bi join a on bi.product_id = a.id where a.lvl < 10
  )
  select max(lvl) into anc_depth from a;

  if anc_depth + item_depth > 4 then
    raise exception 'bundle nesting too deep';
  end if;
  return new;
end;
$$;
