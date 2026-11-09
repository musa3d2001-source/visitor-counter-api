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

-- ---------------------------------------------------------------------
-- أجزاء البند: باقة تضم محتوى معلمين مختلفين تتوزع قيمتها على محتوياتها بسعر قائمة كل محتوى.
-- تُكتب لحظة تأكيد الدفع مع منح الصلاحيات، ومجموع الأجزاء يساوي قيمة البند بالفلس بما فيها ما لا معلم له.
-- teacher_earnings.order_item_id يبقى فريدًا ويصبح اختياريًا: الكود المنشور يكتب فيه كما هو، وسطر الجزء يكتب order_item_part_id بدلًا منه.
-- ---------------------------------------------------------------------
create table if not exists order_item_parts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  order_item_id uuid not null references order_items(id) on delete restrict,
  product_id uuid references products(id) on delete set null,
  title text not null,
  teacher_id uuid references teachers(id) on delete set null,
  teacher_name text,
  list_price_fils integer not null check (list_price_fils >= 0),
  gross_fils integer not null check (gross_fils >= 0),
  created_at timestamptz not null default now(),
  unique (order_item_id, product_id)
);
create index if not exists order_item_parts_order_idx on order_item_parts (order_id);
create index if not exists order_item_parts_teacher_idx on order_item_parts (teacher_id) where teacher_id is not null;
alter table order_item_parts enable row level security;

alter table teacher_earnings alter column order_item_id drop not null;
alter table teacher_earnings add column if not exists order_item_part_id uuid unique references order_item_parts(id) on delete restrict;
alter table teacher_earnings drop constraint if exists teacher_earnings_one_source;
alter table teacher_earnings add constraint teacher_earnings_one_source check ((order_item_id is null) <> (order_item_part_id is null));

-- ---------------------------------------------------------------------
-- إلغاء التسوية: لا يُحذف السطر، ويُستبعد من الرصيد ويبقى ظاهرًا بسبب إلغائه
-- ---------------------------------------------------------------------
alter table teacher_payouts add column if not exists voided_at timestamptz;
alter table teacher_payouts add column if not exists voided_by uuid references users(id) on delete set null;
alter table teacher_payouts add column if not exists void_reason text;
alter table teacher_payouts drop constraint if exists teacher_payouts_void_has_reason;
alter table teacher_payouts add constraint teacher_payouts_void_has_reason
  check (voided_at is null or (void_reason is not null and char_length(void_reason) between 1 and 500));
