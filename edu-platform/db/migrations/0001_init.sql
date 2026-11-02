-- =====================================================================
-- المخطط الأساسي للمنصة التعليمية
-- متوافق مع PostgreSQL 15+ (Supabase) — يُطبَّق عبر: npm run db:migrate
-- القيم المالية مخزنة بالفلس (1 دينار = 1000 فلس) كأعداد صحيحة
-- =====================================================================

create extension if not exists citext;

-- دالة تحديث updated_at تلقائيًا
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- الهيكل الدراسي: المراحل ← الصفوف ← المواد
-- ---------------------------------------------------------------------
create table stages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stages_updated before update on stages for each row execute function set_updated_at();

create table grades (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text not null check (char_length(name) between 2 and 80),
  level smallint not null check (level between 1 and 12),
  current_term smallint not null default 1 check (current_term in (1, 2)),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index grades_stage_idx on grades (stage_id, sort_order);
create trigger grades_updated before update on grades for each row execute function set_updated_at();

create table subjects (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references grades(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text not null check (char_length(name) between 2 and 80),
  icon text not null default 'book' check (char_length(icon) <= 40),
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grade_id, slug),
  unique (id, grade_id)
);
create index subjects_grade_idx on subjects (grade_id, sort_order);
create trigger subjects_updated before update on subjects for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- المستخدمون والجلسات
-- ---------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique check (char_length(email) between 5 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text check (phone ~ '^\+965[0-9]{8}$'),
  role text not null default 'student' check (role in ('student', 'admin')),
  grade_id uuid references grades(id) on delete set null,
  is_active boolean not null default true,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index users_role_idx on users (role, created_at desc);
create trigger users_updated before update on users for each row execute function set_updated_at();

-- معرّف الجلسة = SHA-256 للرمز المخزَّن في الكوكي (لا يُخزَّن الرمز نفسه)
create table sessions (
  id text primary key check (char_length(id) = 64),
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

create table password_reset_tokens (
  id text primary key check (char_length(id) = 64),
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_user_idx on password_reset_tokens (user_id);

-- تحديد عدد المحاولات (تسجيل الدخول، استعادة كلمة المرور...)
create table rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- ---------------------------------------------------------------------
-- المنتجات التعليمية
-- ---------------------------------------------------------------------
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,120}$'),
  type text not null check (type in (
    'final_notes',     -- المذكرة النهائية
    'exam_night',      -- مذكرة ليلة الاختبار
    'exam_model',      -- نموذج الاختبار
    'answer_key',      -- نموذج الإجابة
    'review_notes',    -- مذكرة الشرح والمراجعة
    'bundle',          -- باقة
    'video_course'     -- دروس فيديو مسجلة
  )),
  title text not null check (char_length(title) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 5000),
  contents text not null default '' check (char_length(contents) <= 5000),
  grade_id uuid not null references grades(id) on delete restrict,
  subject_id uuid,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  term smallint check (term in (1, 2)),
  price_fils integer not null check (price_fils >= 0 and price_fils <= 1000000000),
  compare_at_price_fils integer check (compare_at_price_fils is null or compare_at_price_fils > price_fils),
  cover_key text,
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden', 'archived')),
  is_downloadable boolean not null default false,
  is_featured boolean not null default false,
  preview_pages smallint not null default 3 check (preview_pages between 0 and 30),
  sort_order integer not null default 0,
  page_count integer,
  published_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- المادة يجب أن تنتمي لنفس الصف
  foreign key (subject_id, grade_id) references subjects (id, grade_id) on delete restrict
);
create index products_catalog_idx on products (grade_id, subject_id, status, sort_order);
create index products_published_idx on products (status, published_at desc);
create index products_type_idx on products (type);
create trigger products_updated before update on products for each row execute function set_updated_at();

-- ملفات المنتج (الأصلية في التخزين الخاص)
create table product_files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  kind text not null check (kind in ('main', 'preview')),
  title text not null check (char_length(title) between 1 and 160),
  storage_key text not null unique,
  original_name text not null default '',
  mime_type text not null check (mime_type = 'application/pdf'),
  size_bytes bigint not null check (size_bytes > 0),
  page_count integer,
  is_auto_preview boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_files_product_idx on product_files (product_id, kind, sort_order);
create trigger product_files_updated before update on product_files for each row execute function set_updated_at();

-- محتويات الباقات (بدون باقات متداخلة)
create table bundle_items (
  bundle_id uuid not null references products(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (bundle_id, product_id),
  check (bundle_id <> product_id)
);
create index bundle_items_product_idx on bundle_items (product_id);

create or replace function check_bundle_item() returns trigger
language plpgsql as $$
declare
  b_type text;
  i_type text;
begin
  select type into b_type from products where id = new.bundle_id;
  select type into i_type from products where id = new.product_id;
  if b_type is distinct from 'bundle' then
    raise exception 'bundle_items.bundle_id must reference a bundle product';
  end if;
  if i_type = 'bundle' then
    raise exception 'nested bundles are not allowed';
  end if;
  return new;
end;
$$;
create trigger bundle_items_check before insert or update on bundle_items for each row execute function check_bundle_item();

-- دروس الفيديو (للمنتجات من نوع video_course)
create table lessons (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_title text not null default '' check (char_length(unit_title) <= 120),
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  provider text not null check (provider in ('file', 'bunny')),
  video_ref text not null check (char_length(video_ref) between 1 and 300),
  mime_type text,
  size_bytes bigint,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  is_free_preview boolean not null default false,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_product_idx on lessons (product_id, sort_order);
create trigger lessons_updated before update on lessons for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- الكوبونات
-- ---------------------------------------------------------------------
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code citext not null unique check (code ~* '^[a-z0-9_-]{3,32}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  min_order_fils integer not null default 0 check (min_order_fils >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_user integer not null default 1 check (max_per_user > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger coupons_updated before update on coupons for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- الطلبات والمدفوعات
-- ---------------------------------------------------------------------
create sequence order_number_seq start 100001;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('ORD-' || nextval('order_number_seq')::text),
  user_id uuid not null references users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  subtotal_fils integer not null check (subtotal_fils >= 0),
  discount_fils integer not null default 0 check (discount_fils >= 0),
  total_fils integer not null check (total_fils >= 0),
  currency char(3) not null default 'KWD' check (currency = 'KWD'),
  coupon_id uuid references coupons(id) on delete set null,
  coupon_code text,
  is_test boolean not null default false,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_fils = subtotal_fils - discount_fils),
  check (status <> 'paid' or paid_at is not null)
);
create index orders_user_idx on orders (user_id, created_at desc);
create index orders_status_idx on orders (status, paid_at desc);
create index orders_created_idx on orders (created_at desc);
create trigger orders_updated before update on orders for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  title text not null,
  product_type text not null,
  unit_price_fils integer not null check (unit_price_fils >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index order_items_product_idx on order_items (product_id);

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons(id) on delete cascade,
  order_id uuid not null unique references orders(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on coupon_redemptions (coupon_id, user_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  provider text not null check (provider in ('myfatoorah', 'free')),
  environment text not null check (environment in ('sandbox', 'live', 'none')),
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'paid', 'failed', 'expired', 'refunded')),
  amount_fils integer not null check (amount_fils >= 0),
  currency char(3) not null default 'KWD',
  gateway_invoice_id text,
  gateway_payment_id text,
  payment_method text,
  payment_url text,
  last_gateway_status jsonb,
  error_message text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, gateway_invoice_id),
  unique (provider, gateway_payment_id)
);
create index payments_order_idx on payments (order_id, created_at desc);
create trigger payments_updated before update on payments for each row execute function set_updated_at();

-- أحداث بوابة الدفع (Webhook) — مفتاح فريد لمنع المعالجة المكررة
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null unique,
  event_name text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  result text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index payment_events_received_idx on payment_events (received_at desc);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  amount_fils integer not null check (amount_fils > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'recorded' check (status in ('recorded', 'requested', 'completed', 'failed')),
  gateway_refund_id text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index refunds_order_idx on refunds (order_id);

-- ---------------------------------------------------------------------
-- صلاحيات الوصول (ما يملكه الطالب)
-- ---------------------------------------------------------------------
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  source text not null check (source in ('purchase', 'bundle', 'manual', 'free')),
  order_id uuid references orders(id) on delete set null,
  via_bundle_id uuid references products(id) on delete set null,
  granted_by uuid references users(id) on delete set null,
  grant_reason text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references users(id) on delete set null,
  revoke_reason text,
  unique (user_id, product_id)
);
create index entitlements_user_active_idx on entitlements (user_id) where revoked_at is null;
create index entitlements_product_idx on entitlements (product_id);
create index entitlements_order_idx on entitlements (order_id);

-- تقدم القراءة والمشاهدة
create table reading_progress (
  user_id uuid not null references users(id) on delete cascade,
  file_id uuid not null references product_files(id) on delete cascade,
  last_page integer not null default 1 check (last_page >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

create table lesson_progress (
  user_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- ---------------------------------------------------------------------
-- الإعدادات والسجلات
-- ---------------------------------------------------------------------
create table settings (
  key text primary key check (key ~ '^[a-z_]{2,60}$'),
  value jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on audit_logs (created_at desc);

create table access_logs (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  file_id uuid,
  lesson_id uuid,
  action text not null check (action in ('view', 'download', 'preview', 'video', 'denied')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index access_logs_user_idx on access_logs (user_id, created_at desc);
create index access_logs_created_idx on access_logs (created_at desc);

create table email_log (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  template text not null,
  -- يُخزَّن النص فقط عند استخدام مشغل البريد "log" (بيئة التطوير/الاختبار)
  body text,
  status text not null check (status in ('sent', 'logged', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- أمان Supabase: تفعيل RLS على كل الجداول بدون سياسات
-- => واجهة Supabase Data API (anon/authenticated) لا تستطيع قراءة أي شيء.
-- التطبيق يتصل من الخادم فقط بدور قاعدة بيانات موثوق.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'stages','grades','subjects','users','sessions','password_reset_tokens','rate_limits',
    'products','product_files','bundle_items','lessons','coupons','orders','order_items',
    'coupon_redemptions','payments','payment_events','refunds','entitlements','reading_progress',
    'lesson_progress','settings','audit_logs','access_logs','email_log'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
    execute 'alter default privileges in schema public revoke all on sequences from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
  end if;
end;
$$;
