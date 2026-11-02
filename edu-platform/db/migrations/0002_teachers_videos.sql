-- =====================================================================
-- 0002: المعلمون، الفيديو، المراجعة قبل النشر، فترات الإتاحة، أرباح المعلمين
-- ترحيل آمن للبيانات الموجودة:
--   * لا يحذف أي صف، ولا يغيّر صلاحيات المشترين الحاليين (expires_at = null = وصول غير محدد)
--   * المنتجات الحالية تبقى بدون معلم (محتوى المنصة) وبنفس حالتها وأسعارها
--   * الدروس الحالية تُعتبر جاهزة (processing_status = 'ready')
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) دور المعلم
-- ---------------------------------------------------------------------
alter table users drop constraint users_role_check;
alter table users add constraint users_role_check check (role in ('student', 'admin', 'teacher'));

-- ---------------------------------------------------------------------
-- 2) المعلمون (الملف العام منفصل عن حساب الدخول)
--    managed      : يديره المالك بالكامل — بلا حساب دخول
--    self_managed : له حساب دخول (user_id) ويرفع مسوداته بنفسه
--    التحويل بين الوضعين لا يمس المحتوى أو المبيعات (كلها مرتبطة بـ teachers.id)
-- ---------------------------------------------------------------------
create table teachers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  headline text not null default '' check (char_length(headline) <= 140),
  bio text not null default '' check (char_length(bio) <= 3000),
  photo_key text,
  mode text not null default 'managed' check (mode in ('managed', 'self_managed')),
  user_id uuid unique references users(id) on delete set null,
  can_upload boolean not null default true,
  is_published boolean not null default false,
  -- حصة المعلم بالنقاط الأساسية (10000 = 100%) — null = نظام الأرباح غير مفعل لهذا المعلم
  revenue_share_bps integer check (revenue_share_bps is null or revenue_share_bps between 0 and 10000),
  sort_order integer not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode = 'managed' or user_id is not null)
);
create index teachers_public_idx on teachers (is_published, sort_order);
create trigger teachers_updated before update on teachers for each row execute function set_updated_at();

create table teacher_subjects (
  teacher_id uuid not null references teachers(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);
create index teacher_subjects_subject_idx on teacher_subjects (subject_id);

-- ---------------------------------------------------------------------
-- 3) المنتجات: أنواع الفيديو، المعلم، المراجعة، فترة الإتاحة
-- ---------------------------------------------------------------------
alter table products drop constraint products_type_check;
alter table products add constraint products_type_check check (type in (
  'final_notes', 'exam_night', 'exam_model', 'answer_key', 'review_notes',   -- مذكرات PDF
  'video_lesson',   -- درس فيديو منفرد
  'unit',           -- شرح وحدة (عدة دروس)
  'quiz_review',    -- مراجعة اختبار قصير
  'exam_review',    -- مراجعة ليلة الاختبار (فيديو)
  'video_course',   -- دورة مادة كاملة
  'bundle'          -- باقة (فيديوهات وملفات)
));

alter table products drop constraint products_status_check;
alter table products add constraint products_status_check check (status in ('draft', 'in_review', 'published', 'hidden', 'archived'));

alter table products add column teacher_id uuid references teachers(id) on delete restrict;
alter table products add column proposed_price_fils integer check (proposed_price_fils is null or proposed_price_fils between 0 and 1000000000);
alter table products add column review_note text check (review_note is null or char_length(review_note) <= 2000);
alter table products add column submitted_at timestamptz;
alter table products add column reviewed_at timestamptz;
alter table products add column reviewed_by uuid references users(id) on delete set null;
alter table products add column access_mode text not null default 'unlimited' check (access_mode in ('unlimited', 'until_date', 'days'));
alter table products add column access_until timestamptz;
alter table products add column access_days integer check (access_days is null or access_days between 1 and 3650);
alter table products add constraint products_access_until_required check (access_mode <> 'until_date' or access_until is not null);
alter table products add constraint products_access_days_required check (access_mode <> 'days' or access_days is not null);
create index products_teacher_idx on products (teacher_id, status);
create index products_review_idx on products (status, submitted_at) where status = 'in_review';

-- ---------------------------------------------------------------------
-- 4) المحتويات المركبة: الباقة/الدورة/الوحدة تضم منتجات أخرى
--    (باقة ← دورة ← وحدات ← دروس منفردة) مع منع الحلقات وحد أقصى للعمق
-- ---------------------------------------------------------------------
create or replace function check_bundle_item() returns trigger
language plpgsql as $$
declare
  b_type text;
  cyc boolean;
  depth integer;
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
  -- حد العمق (4 مستويات)
  with recursive d(id, lvl) as (
    select new.product_id, 1
    union all
    select bi.product_id, d.lvl + 1 from bundle_items bi join d on bi.bundle_id = d.id where d.lvl < 10
  )
  select max(lvl) into depth from d;
  if depth > 4 then
    raise exception 'bundle nesting too deep';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) الدروس: صورة مصغرة، حالة المعالجة، من رفعها
-- ---------------------------------------------------------------------
alter table lessons add column thumbnail_key text;
alter table lessons add column processing_status text not null default 'ready'
  check (processing_status in ('uploading', 'processing', 'ready', 'failed'));
alter table lessons add column processing_error text;
alter table lessons add column uploaded_by uuid references users(id) on delete set null;
alter table lessons add column status_checked_at timestamptz;
create index lessons_processing_idx on lessons (processing_status) where processing_status <> 'ready';
create unique index lessons_bunny_ref_idx on lessons (video_ref) where provider = 'bunny';

-- ---------------------------------------------------------------------
-- 6) الصلاحيات: تاريخ انتهاء اختياري (null = وصول غير محدد)
-- ---------------------------------------------------------------------
alter table entitlements add column expires_at timestamptz;

-- ---------------------------------------------------------------------
-- 7) لقطة هوية المعلم في عناصر الطلب (لا تتغير بتعديل ملفه لاحقًا)
-- ---------------------------------------------------------------------
alter table order_items add column teacher_id uuid references teachers(id) on delete set null;
alter table order_items add column teacher_name text;
create index order_items_teacher_idx on order_items (teacher_id);

-- ---------------------------------------------------------------------
-- 8) السجل المحاسبي لأرباح المعلمين (تسوية يدوية — بلا تحويلات تلقائية)
-- ---------------------------------------------------------------------
create table teacher_earnings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  order_item_id uuid not null unique references order_items(id) on delete restrict,
  teacher_id uuid not null references teachers(id) on delete restrict,
  teacher_name text not null,
  product_id uuid references products(id) on delete set null,
  product_title text not null,
  gross_fils integer not null check (gross_fils >= 0),
  discount_fils integer not null default 0 check (discount_fils >= 0),
  fee_fils integer not null default 0 check (fee_fils >= 0),
  net_fils integer not null check (net_fils >= 0),
  share_bps integer not null check (share_bps between 0 and 10000),
  teacher_fils integer not null check (teacher_fils >= 0),
  platform_fils integer not null check (platform_fils >= 0),
  is_test boolean not null default false,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  check (net_fils = gross_fils - discount_fils - fee_fils),
  check (teacher_fils + platform_fils = net_fils),
  check (status <> 'reversed' or reversed_at is not null)
);
create index teacher_earnings_teacher_idx on teacher_earnings (teacher_id, created_at desc);
create index teacher_earnings_order_idx on teacher_earnings (order_id);

create table teacher_payouts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete restrict,
  amount_fils integer not null check (amount_fils > 0),
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'cash', 'other')),
  reference text not null default '' check (char_length(reference) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  paid_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index teacher_payouts_teacher_idx on teacher_payouts (teacher_id, paid_at desc);

-- ---------------------------------------------------------------------
-- 9) أحداث مزود الفيديو (منع المعالجة المكررة)
-- ---------------------------------------------------------------------
create table video_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null unique,
  payload jsonb not null,
  result text,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10) RLS على الجداول الجديدة (كما في 0001)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['teachers', 'teacher_subjects', 'teacher_earnings', 'teacher_payouts', 'video_events'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
  end if;
end;
$$;
