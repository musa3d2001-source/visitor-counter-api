-- =====================================================================
-- 0014: تقوية — صلاحية تنفيذ دوال قاعدة البيانات
-- إضافي بالكامل: لا جداول ولا أعمدة، سحب صلاحيات فقط، أقفال قصيرة على تعريفات الدوال.
-- الكود يتصل بالدور الذي ينشئ الجداول والدوال (مالكها)، والمالك ينفذ دواله دائمًا، فلا أثر على الكود القديم أو الجديد.
--
-- لماذا: PostgreSQL يمنح PUBLIC صلاحية EXECUTE على كل دالة جديدة تلقائيًا، وعلى Supabase يمنح أيضًا anon و authenticated
-- (أدوار واجهة REST العامة) صلاحيات افتراضية في schema public. 0001 سحبها من الدوال الموجودة يومها فقط، فدوال 0011
-- (consent_records_append_only, redaction_pick, redact_gateway_status, redact_webhook_payload) بقيت قابلة للاستدعاء
-- من واجهة REST العامة بمفتاح anon. 0010 و0012 و0013 لا تنشئ دوالًا.
-- =====================================================================

-- 1) الدوال الموجودة: لا أحد غير المالك
revoke execute on all functions in schema public from public;

-- 2) الدوال القادمة التي ينشئها هذا الدور (أي ترحيل لاحق): لا تُمنح لـ PUBLIC تلقائيًا.
--    بلا "in schema": هذا وحده يلغي المنح العام الافتراضي، ولا يمكن إلغاؤه لكل schema على حدة.
alter default privileges revoke execute on functions from public;

-- 3) أدوار Supabase العامة إن وُجدت (لا توجد في PostgreSQL محلي)
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke execute on functions from %I', r);
      execute format('alter default privileges revoke execute on functions from %I', r);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- نسخ PDF المختومة (مرحلة pdf، القرار F3)
-- نسخة المشتري المختومة باسمه تُحفظ في الحاوية الخاصة وتُعاد في الفتح التالي بدل ختم جديد.
-- هي بيانات شخصية (تحمل بريده ورقم طلبه): مفتاح عشوائي لا يُخمَّن، لا رابط لها من المتصفح أبدًا،
-- وتُحذف عند حذف بيانات الحساب، وعند تغير الملف، وبعد مدة بلا استخدام (مهمة التنظيف اليومية).
-- جدول جديد فقط: لا قفل على جدول قائم، والكود القديم لا يعرفه فلا يتأثر.
--   state: stamping (يجري ختمها الآن، lease_until حد العقد) / ready / doomed (تنتظر حذف الكائن من التخزين)
--   file_version: storage_key للملف وقت الختم. ملف بديل له مفتاح جديد، فلا تُستعمل نسخة الملف القديم.
-- لا مفاتيح أجنبية: حذف ملف أو منتج لا يحذف الصف وحده فيضيع كائنه في التخزين. التنظيف اليومي يجدها ويحذف الاثنين.
-- =====================================================================
create table if not exists stamped_copies (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  file_id uuid not null,
  file_version text not null,
  object_key text not null unique check (object_key ~ '^stamped/[0-9a-f-]{36}\.pdf$'),
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  state text not null default 'stamping' check (state in ('stamping', 'ready', 'doomed')),
  holder uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
-- نسخة حية واحدة لكل مفتاح: ختمان متزامنان من نسختي خادم يلتقيان هنا فيختم أحدهما فقط
create unique index if not exists stamped_copies_live_key on stamped_copies (cache_key) where state <> 'doomed';
create index if not exists stamped_copies_owner on stamped_copies (user_id, file_id) where state = 'ready';
create index if not exists stamped_copies_sweep on stamped_copies (state, last_used_at);

-- =====================================================================
-- تذاكر الرفع المباشر (مرحلة pdf، K053 و K035)
-- كل رابط رفع يصدر يُسجل بمفتاحه وحجمه المعلن ومن طلبه. التأكيد يقبل فقط مفتاحًا له تذكرة من الشخص نفسه
-- وبالحجم المعلن بالضبط، والمهمة اليومية تحذف كائنات التذاكر التي لم تُؤكد خلال يوم.
-- جدول جديد فقط. رفع بدأ على الكود القديم قبل النشر لا تذكرة له، فيُطلب رفعه من جديد.
-- =====================================================================
create table if not exists upload_tickets (
  storage_key text primary key,
  bucket text not null check (bucket in ('private', 'public')),
  target text not null,
  actor_id uuid not null,
  declared_size bigint not null check (declared_size > 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists upload_tickets_sweep on upload_tickets (created_at) where completed_at is null;

-- =====================================================================
-- معالجة المدفوعات (مرحلة payments-healing، القرارات F4 و F16 و F17، البنود K003 و K011 و K016 و K071)
-- إضافي: أعمدة تقبل NULL بلا قيمة افتراضية وجداول جديدة. الكود القديم لا يقرأها فلا يتأثر.
-- =====================================================================

-- لقطة شروط البيع وقت إنشاء الطلب (K011): تغيير نسبة المعلم أو الرسوم بعد الطلب لا يغيّر ما يستحقه.
-- earnings_snapshot_at فارغ يعني طلبًا أقدم من هذا الترحيل: يُحسب بالطريقة القديمة (القراءة وقت التأكيد)، فيُسوّى كما كان.
-- share_bps فارغ في طلب له لقطة يعني أن البند لا نسبة لمعلم عليه، وليس أن اللقطة ناقصة.
alter table orders add column if not exists earnings_snapshot_at timestamptz;
alter table orders add column if not exists fee_bps integer check (fee_bps is null or fee_bps between 0 and 10000);
alter table orders add column if not exists fee_fixed_fils integer check (fee_fixed_fils is null or fee_fixed_fils >= 0);
alter table order_items add column if not exists share_bps integer check (share_bps is null or share_bps between 0 and 10000);
alter table order_item_parts add column if not exists share_bps integer check (share_bps is null or share_bps between 0 and 10000);

-- رقم الفاتورة وحده ليس هوية (K016): sandbox و live عدّادان مستقلان لدى البوابة وقد يتطابقان.
-- الفهرس الجديد أولًا ثم حذف القيد القديم، حتى لا تمر لحظة بلا قيد تفرد. الجدول صغير عند التطبيق، فالقفل قصير.
create unique index if not exists payments_invoice_per_environment on payments (provider, environment, gateway_invoice_id);
create unique index if not exists payments_payment_per_environment on payments (provider, environment, gateway_payment_id);
alter table payments drop constraint if exists payments_provider_gateway_invoice_id_key;
alter table payments drop constraint if exists payments_provider_gateway_payment_id_key;

-- طابور وظيفة التسوية: الفواتير غير المؤكدة فقط، فلا يكبر مسحها مع تراكم المدفوعات المكتملة
create index if not exists payments_unverified_idx on payments (last_checked_at nulls first, created_at)
  where gateway_invoice_id is not null and status in ('initiated', 'pending', 'failed', 'expired');

-- تعليق طلب مدفوع بسبب نزاع أو استرداد جزئي من لوحة البوابة (K003).
-- التعليق يسحب صلاحيات هذا الطلب فقط ويوقف أرباحه، وتُعاد بالضبط عند قرار المالك: revoked_at و held_at يساويان held_at هنا.
-- سحب الصلاحية نفسه هو التعليق، فلا يضاف أي فحص جديد على مسار الوصول.
create table if not exists order_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  payment_id uuid references payments(id) on delete set null,
  kind text not null check (kind in ('dispute', 'partial_refund')),
  source_key text not null unique check (char_length(source_key) <= 128),
  gateway_status text check (char_length(gateway_status) <= 32),
  amount_fils integer check (amount_fils is null or amount_fils >= 0),
  held_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references users(id) on delete set null,
  resolution text check (resolution is null or resolution in ('released', 'money_returned')),
  check ((released_at is null) = (resolution is null))
);
-- تعليق حي واحد لكل طلب: حدث ثانٍ على طلب معلق يصل تنبيهًا ولا يكتب فوق ما سيُعاد
create unique index if not exists order_holds_one_active on order_holds (order_id) where released_at is null;
create index if not exists order_holds_open_idx on order_holds (held_at desc) where released_at is null;
alter table order_holds enable row level security;

alter table teacher_earnings add column if not exists held_at timestamptz;

-- وسائل الدفع المعروضة لكل شريحة مبلغ (K071): نسخة خادم باردة تقرأ من هنا ولا تنتظر البوابة. لا بيانات شخصية فيها.
create table if not exists payment_method_cache (
  environment text not null check (environment in ('sandbox', 'live')),
  band integer not null check (band >= 0),
  methods jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (environment, band)
);
alter table payment_method_cache enable row level security;

-- جدولا مرحلة pdf أعلاه بلا RLS، فكانا ظاهرين لأدوار واجهة REST العامة كسائر ما لا يُفعل عليه
alter table stamped_copies enable row level security;
alter table upload_tickets enable row level security;

-- =====================================================================
-- إثبات العامل الثاني للأوامر الحساسة (مرحلة access-stepup، القرار F7)
-- وقت آخر رمز صحيح أدخله المالك على هذه الجلسة بعينها. الجلسة نفسها هي الرابط، فجلسة أخرى لا تستفيد منه.
-- عمود بلا قيمة افتراضية: لا إعادة كتابة للجدول، والكود القديم لا يقرؤه.
-- الجدول يُقرأ مع كل طلب، فمهلة القفل القصيرة تمنع طابورًا خلف هذا التغيير. إن انتهت المهلة يفشل الترحيل كله دون أثر، وتعيد تشغيله.
-- =====================================================================
set local lock_timeout = '5s';
alter table sessions add column if not exists step_up_at timestamptz;
set local lock_timeout = default;


-- =====================================================================
-- الطلاب وأولياء الأمور (مرحلة access-accounts، القرار F8 و K039)
-- =====================================================================
-- إقرار خطوة التسجيل: ولي الأمر يعلم بالحساب. إقرار معلن لا تحقق، وسجله ملحق فقط كبقية الموافقات.
-- NOT VALID ثم VALIDATE: لا يمسك قفلًا طويلًا على جدول تكتب فيه كل عملية دفع.
set local lock_timeout = '5s';
alter table consent_records drop constraint if exists consent_records_kind_check;
alter table consent_records add constraint consent_records_kind_check check (kind in ('terms', 'privacy', 'guardian_purchase', 'teacher_agreement', 'guardian_account')) not valid;
alter table consent_records validate constraint consent_records_kind_check;
set local lock_timeout = default;

-- طلب الطالب حذف حسابه أو نسخة من بياناته (K039): المالك يراه ويقرر، ولا ينفذه النظام وحده.
create table if not exists account_data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('delete', 'copy')),
  status text not null default 'open' check (status in ('open', 'done', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references users(id) on delete set null,
  close_note text check (close_note is null or char_length(close_note) <= 500)
);
-- طلب مفتوح واحد من كل نوع: إعادة الضغط لا تملأ قائمة المالك
create unique index if not exists account_data_requests_one_open on account_data_requests (user_id, kind) where status = 'open';
create index if not exists account_data_requests_open_idx on account_data_requests (created_at) where status = 'open';
alter table account_data_requests enable row level security;

-- رقم خطوة «مراجعة المحامي» يجمع أرقام كل الوثائق، وقد زادت وثيقة فتجاوز ٢٠٠ حرف
set local lock_timeout = '5s';
alter table launch_checks drop constraint if exists launch_checks_version_check;
alter table launch_checks add constraint launch_checks_version_check check (char_length(version) between 1 and 400) not valid;
alter table launch_checks validate constraint launch_checks_version_check;
set local lock_timeout = default;

-- =====================================================================
-- الفيديو (مرحلة video، القرار F9، البند K025)
-- حالة جديدة للدرس held: تغيّر ملف الفيديو بعد اعتماده، فيُحجب عن الطلاب حتى يقرر المالك.
-- القيمة الجديدة لا يكتبها إلا الكود الجديد، والكود القديم يقرأ processing_status = 'ready' فقط، فلا يتأثر.
--   video_fingerprint: بصمة الفيديو الذي اعتُمد (originalHash من Bunny، وإلا تاريخ الرفع والأبعاد والمدة)
--   video_hold_fingerprint: بصمة ما وُجد بعد التغيير. لا يقبل المالك إلا ما شاهده: تغيّر آخر يرفض القبول
-- =====================================================================
set local lock_timeout = '5s';
alter table lessons drop constraint if exists lessons_processing_status_check;
alter table lessons add constraint lessons_processing_status_check check (processing_status in ('uploading', 'processing', 'ready', 'failed', 'held')) not valid;
alter table lessons validate constraint lessons_processing_status_check;
alter table lessons add column if not exists video_fingerprint jsonb;
alter table lessons add column if not exists video_hold_fingerprint jsonb;
set local lock_timeout = default;

-- =====================================================================
-- عدّادات الضغط (مرحلة load، البند K099)
-- كم مرة امتلأ شيء فرفضنا طلبًا أو انتهت مهلته، لكل نوع في كل ساعة. أعداد فقط: لا حساب ولا عنوان ولا مسار.
-- جدول جديد لا يلمسه الكود القديم، ويُنظف بعد ١٤ يومًا.
-- =====================================================================
create table if not exists saturation_counters (
  hour timestamptz not null,
  kind text not null check (kind in ('login_shed', 'stamp_shed', 'stamp_deadline', 'db_pool_wait', 'db_deadline')),
  count bigint not null default 0 check (count >= 0),
  primary key (hour, kind)
);
alter table saturation_counters enable row level security;
