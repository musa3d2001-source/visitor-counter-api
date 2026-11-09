-- =====================================================================
-- 0013: تشغيل الموقع — سجل الأخطاء، تنبيهات المالك، ونبض الوظائف المجدولة
-- إضافي بالكامل: جداول جديدة فقط، لا يقرؤها الكود المنشور حاليًا، ولا يلمس أي جدول قائم.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) سجل الأخطاء: صف واحد لكل خطأ متكرر (البصمة فريدة) ويزيد العداد بدل صفوف جديدة.
--    لا يدخله إلا نص مُنقّى (src/lib/redact.ts): لا بيانات شخصية ولا رموز ولا بيانات بطاقات.
--    عدد الصفوف محدود من التطبيق (٥٠٠) والقديم يُحذف بالوظيفة اليومية بعد ٣٠ يومًا.
-- ---------------------------------------------------------------------
create table error_events (
  id bigint generated always as identity primary key,
  fingerprint text not null unique check (char_length(fingerprint) = 64),
  source text not null check (char_length(source) <= 64),
  route text check (char_length(route) <= 200),
  message text not null check (char_length(message) <= 500),
  digest text check (char_length(digest) <= 64),
  stack text check (char_length(stack) <= 2000),
  occurrences integer not null default 1 check (occurrences > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index error_events_last_seen_idx on error_events (last_seen_at desc);

-- ---------------------------------------------------------------------
-- 2) حالة تنبيهات البريد: رسالة واحدة لكل نوع في كل فترة، مهما كثرت الأحداث.
--    suppressed = أحداث وقعت في الفترة ولم تُرسل عنها رسالة، وتُذكر في الرسالة التالية.
-- ---------------------------------------------------------------------
create table ops_alert_state (
  kind text primary key check (char_length(kind) <= 32),
  last_sent_at timestamptz,
  suppressed integer not null default 0 check (suppressed >= 0),
  last_suppressed_at timestamptz
);

-- ---------------------------------------------------------------------
-- 3) نبض الوظائف المجدولة: آخر بدء وآخر نجاح وآخر خطأ لكل وظيفة، والمالك يراها.
--    lease_until = عقد مؤقت يمنع تداخل تشغيلين، ويزول وحده إن ماتت الدالة قبل أن تنهي.
-- ---------------------------------------------------------------------
create table job_heartbeats (
  job text primary key check (char_length(job) <= 64),
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text check (char_length(last_error) <= 500),
  last_report jsonb,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);

-- كل الوصول من الخادم بدور موثوق، وواجهة Data API لا ترى شيئًا (نفس قاعدة 0001)
alter table error_events enable row level security;
alter table ops_alert_state enable row level security;
alter table job_heartbeats enable row level security;
