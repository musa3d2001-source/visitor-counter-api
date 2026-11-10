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
