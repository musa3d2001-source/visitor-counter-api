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

-- ---------------------------------------------------------------------
-- 4) عمر الطلب وعمر الفاتورة (D3)
--    الطلب يعيش ٧٢ ساعة، ويُغلق بحالة cancelled مع سبب الإغلاق (لا نوسع قيد الحالات حتى يبقى
--    الكود المنشور حاليًا صحيحًا). الفاتورة تحمل expires_at لأننا نرسل ExpiryDate قصيرًا للبوابة.
--    last_checked_at = آخر مرة ردّت فيها البوابة عن هذه الفاتورة، وعليه تعتمد جملة «لم يُخصم مبلغ» وإغلاق الطلب.
--    reconcile_claimed_at = مطالبة وظيفة التسوية بالفاتورة حتى لا تعالجها نسختان معًا.
--    كل الأعمدة فارغة افتراضيًا: لا إعادة كتابة للجداول، والكود المنشور لا يقرؤها.
-- ---------------------------------------------------------------------
alter table orders add column closed_at timestamptz;
alter table orders add column closed_reason text check (closed_reason is null or closed_reason in ('expired', 'student_cancelled', 'already_owned', 'coupon_unavailable', 'product_ended'));

alter table payments add column expires_at timestamptz;
alter table payments add column last_checked_at timestamptz;
alter table payments add column reconcile_claimed_at timestamptz;
-- رفض أكمل الطالب بعده على الرابط نفسه: إعادة قراءته (Webhook مكرر أو فحص) لا تعيد الطلب إلى فاشل
alter table payments add column acknowledged_failure_id text;

create index payments_recheck_idx on payments (last_checked_at asc nulls first)
  where gateway_invoice_id is not null and status in ('initiated', 'pending', 'failed', 'expired');

-- ---------------------------------------------------------------------
-- 5) الدفعات الزائدة: مال حقيقي وصل ولا يكمل طلبًا (دفعة ثانية على طلب مدفوع أو مسترد،
--    أو دفعة متأخرة على طلب مغلق تعذر إكماله، أو مبلغ لا يطابق الطلب).
--    الصف يبقى للأبد كسجل. استرداده لا يمس الطلب ولا الوصول ولا الأرباح.
-- ---------------------------------------------------------------------
create table payment_extras (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete restrict,
  order_id uuid not null references orders(id) on delete restrict,
  kind text not null check (kind in ('duplicate', 'after_refund', 'late_review', 'amount_mismatch')),
  amount_fils integer not null check (amount_fils > 0),
  -- فارغ: الدفعة الزائدة هي الفاتورة كلها. وإلا فهي عملية نجاح إضافية بعينها على فاتورة أكملت الطلب أو سُجلت
  gateway_payment_id text,
  details jsonb not null default '{}'::jsonb,
  state text not null default 'open' check (state in ('open', 'refund_sending', 'refund_unknown', 'refund_requested', 'refunded', 'refund_failed', 'dismissed')),
  refund_attempt integer not null default 0,
  refund_claimed_at timestamptz,
  gateway_refund_id text,
  gateway_refund_reference text,
  refund_error text check (char_length(refund_error) <= 500),
  refund_reason text check (char_length(refund_reason) <= 500),
  refund_requested_by uuid references users(id) on delete set null,
  refund_requested_at timestamptz,
  -- آخر مرة سألت فيها وظيفة التسوية البوابة عن استرداد لم يصلنا حدثه
  swept_at timestamptz,
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payment_extras_one_per_invoice on payment_extras (payment_id) where gateway_payment_id is null;
create unique index payment_extras_one_per_transaction on payment_extras (payment_id, gateway_payment_id) where gateway_payment_id is not null;
create index payment_extras_open_idx on payment_extras (created_at desc) where state not in ('refunded', 'dismissed');
create index payment_extras_order_idx on payment_extras (order_id);
create trigger payment_extras_updated before update on payment_extras for each row execute function set_updated_at();
alter table payment_extras enable row level security;

-- BEGIN backfill payment_extras
-- دفعات ناجحة سابقة لهذا الترحيل بلا أي علامة: أقدمها هو الدفعة الأصلية، والبقية زائدة.
-- على طلب مسترد صف «paid» المتبقي دفعة لم تُسترد.
insert into payment_extras (payment_id, order_id, kind, amount_fils, details)
select p.id, p.order_id, case when o.status = 'refunded' then 'after_refund' else 'duplicate' end, p.amount_fils, jsonb_build_object('source', 'backfill')
from payments p
join orders o on o.id = p.order_id
where p.provider = 'myfatoorah'
  and p.status = 'paid'
  and p.amount_fils > 0
  and (
    o.status = 'refunded'
    or (
      o.status = 'paid'
      and exists (
        select 1 from payments first_paid
        where first_paid.order_id = p.order_id and first_paid.provider = 'myfatoorah' and first_paid.status = 'paid' and first_paid.id <> p.id
          and (coalesce(first_paid.paid_at, first_paid.created_at), first_paid.id) < (coalesce(p.paid_at, p.created_at), p.id)
      )
    )
  )
on conflict (payment_id) where gateway_payment_id is null do nothing;
-- END backfill payment_extras

-- ---------------------------------------------------------------------
-- 6) الاسترداد أمر واحد (D1): البوابة أولًا، ثم الحالة وسحب الوصول وعكس الأرباح معًا.
--    sending   = مطالبة ذرّية قبل استدعاء البوابة
--    unknown   = انقطع الرد، ولا إعادة إرسال قبل إعادة التحقق
--    not_sent  = تأكدنا من البوابة أن الطلب لم يصلها
--    requested = قبلته البوابة وينتظر التنفيذ، completed = نفذته، failed = رفضته أو ألغته
--    dismissed = أغلقه المالك بلا استرداد. recorded تبقى للصفوف القديمة فقط.
--    الأعمدة الجديدة لها قيم افتراضية أو فارغة: لا إعادة كتابة للجدول، والكود المنشور لا يقرؤها.
--    الفهرس الفريد آمن على البيانات الحالية: الكود القديم لا يدرج إلا لطلب مدفوع ويقلبه في المعاملة نفسها.
-- ---------------------------------------------------------------------
alter table refunds drop constraint refunds_status_check;
alter table refunds add constraint refunds_status_check
  check (status in ('recorded', 'sending', 'unknown', 'not_sent', 'requested', 'completed', 'failed', 'dismissed'));
alter table refunds add column attempt integer not null default 0;
alter table refunds add column claimed_at timestamptz;
alter table refunds add column gateway_refund_reference text;
alter table refunds add column error text check (char_length(error) <= 500);
alter table refunds add column source text not null default 'owner' check (source in ('owner', 'portal'));
alter table refunds add column accepted_at timestamptz;
alter table refunds add column completed_at timestamptz;
alter table refunds add column updated_at timestamptz not null default now();
-- آخر مرة سألت فيها وظيفة التسوية البوابة عن طلب قبلته ولم يصلنا حدثه
alter table refunds add column swept_at timestamptz;
create trigger refunds_updated before update on refunds for each row execute function set_updated_at();
create unique index refunds_one_live_per_order on refunds (order_id) where status <> 'dismissed';
create index refunds_open_idx on refunds (created_at desc) where status not in ('completed', 'dismissed');

-- ---------------------------------------------------------------------
-- 7) الطلب المفتوح يحجز كود الخصم: عدّ الحجوزات يتم تحت قفل صف الكود عند كل طلب جديد.
--    الطلب الفاشل يحجزه ما دام على طلبه رابط يمكن دفعه
-- ---------------------------------------------------------------------
create index orders_coupon_open_idx on orders (coupon_id) where coupon_id is not null and status in ('pending', 'failed');
