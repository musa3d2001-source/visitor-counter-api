-- =====================================================================
-- 0010: صلابة المدفوعات — Webhook وتنبيهات المالك
-- ترحيل إضافي آمن للبيانات الموجودة: لا يحذف صفًا ولا يعيد كتابة أي جدول،
-- ويبقى متوافقًا مع الكود المنشور حاليًا (الأعمدة الجديدة لها قيم افتراضية).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) مطالبة معالجة حدث Webhook
--    claimed_at = متى بدأت آخر محاولة معالجة. الحدث الذي بقي processed_at فيه فارغًا
--    لأكثر من ٥ دقائق (تعطل الخادم أثناء المعالجة) يمكن إعادة المطالبة به.
--    now() قيمة غير متطايرة داخل المعاملة، فلا إعادة كتابة للجدول (Postgres 11+)،
--    والأحداث العالقة القديمة تصبح قابلة لإعادة المحاولة بعد ٥ دقائق من الترحيل.
-- ---------------------------------------------------------------------
alter table payment_events add column claimed_at timestamptz default now();

-- ---------------------------------------------------------------------
-- 2) الإشعارات المرفوضة — حلقة ثابتة الحجم (٢٠٠ صف كحد أقصى في المخطط نفسه)
--    الإرسال المجهول لا يستطيع تنمية الجدول: كل رفض يكتب فوق أقدم فتحة.
--    لا نخزن جسم الطلب غير الموثق أبدًا: بيانات وصفية محدودة الطول + الحجم + البصمة فقط.
-- ---------------------------------------------------------------------
create sequence payment_webhook_rejection_slot minvalue 0 maxvalue 199 start 0 cycle;

create table payment_webhook_rejections (
  slot smallint primary key check (slot between 0 and 199),
  provider text not null default 'myfatoorah',
  reason text not null check (char_length(reason) <= 32),
  http_status smallint not null,
  event_code integer,
  event_name text check (char_length(event_name) <= 64),
  event_reference text check (char_length(event_reference) <= 64),
  invoice_id text check (char_length(invoice_id) <= 64),
  version_header text check (char_length(version_header) <= 16),
  body_bytes integer not null default 0 check (body_bytes >= 0),
  body_sha256 text check (char_length(body_sha256) = 64),
  received_at timestamptz not null default now()
);
create index payment_webhook_rejections_received_idx on payment_webhook_rejections (received_at desc);

-- ---------------------------------------------------------------------
-- 3) تنبيهات الدفع للمالك (النزاعات الآن، ويمكن إضافة أنواع أخرى لاحقًا)
--    التنبيه لا يغيّر الطلب أو الصلاحيات: القرار للمالك.
-- ---------------------------------------------------------------------
create table payment_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (char_length(kind) <= 32),
  dedupe_key text not null unique check (char_length(dedupe_key) <= 128),
  order_id uuid references orders(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id) on delete set null
);
create index payment_alerts_open_idx on payment_alerts (created_at desc) where resolved_at is null;
create index payment_alerts_order_idx on payment_alerts (order_id) where order_id is not null;

alter table payment_webhook_rejections enable row level security;
alter table payment_alerts enable row level security;
