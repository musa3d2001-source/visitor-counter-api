-- ضوابط المحتوى قبل البيع: سلامة ملفات PDF، قاعدة المعاينة المجانية، والمنتج المجاني الصريح.
-- إضافي بالكامل، بقيم افتراضية، ولا يغيّر صفًا قائمًا سوى ربط المعاينات بملفها الأصلي.

-- نتيجة فحص الملف: unchecked ملف قديم لم يُفحص بعد، والبقية نتيجة فحص فعلي
alter table product_files add column if not exists check_status text not null default 'unchecked';
alter table product_files add column if not exists checked_at timestamptz;
alter table product_files drop constraint if exists product_files_check_status_valid;
alter table product_files add constraint product_files_check_status_valid
  check (check_status in ('unchecked', 'ok', 'encrypted', 'corrupt', 'too_complex', 'missing'));

-- الملف الرئيسي الذي صُنعت المعاينة منه أو له. فارغ أو مختلف عن أول ملف رئيسي حالي: معاينة قديمة لا تُعرض
alter table product_files add column if not exists source_file_id uuid references product_files(id) on delete set null;

-- ربط المعاينات الحالية بأول ملف رئيسي، بشرط أن تكون أحدث منه. الأقدم منه تعني أن الملف استُبدل بعدها فتبقى بلا ربط
update product_files pv
set source_file_id = m.id
from (
  select distinct on (product_id) id, product_id, created_at
  from product_files
  where kind = 'main'
  order by product_id, sort_order, created_at
) m
where pv.kind = 'preview'
  and pv.product_id = m.product_id
  and pv.created_at >= m.created_at
  and pv.source_file_id is null;

create index if not exists product_files_needs_attention_idx on product_files (check_status) where check_status <> 'ok';
create index if not exists product_files_source_idx on product_files (source_file_id) where source_file_id is not null;

-- مجاني بقرار صريح من المالك: السعر صفر وحده لم يعد يكفي للنشر
alter table products add column if not exists is_free boolean not null default false;
alter table products drop constraint if exists products_free_means_zero;
alter table products add constraint products_free_means_zero check (not is_free or price_fils = 0);
