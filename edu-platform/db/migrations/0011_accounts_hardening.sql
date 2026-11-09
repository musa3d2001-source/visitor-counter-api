-- =====================================================================
-- 0011: صلابة الحسابات — صدق البريد، الاستعادة، تأكيد البريد
-- ترحيل إضافي آمن للبيانات الموجودة: لا يحذف صفًا ولا يعيد كتابة جدول كبير،
-- ويبقى متوافقًا مع الكود المنشور حاليًا (الأعمدة الجديدة لها قيم افتراضية).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) تغيير كلمة المرور الإجباري
--    must_change_password: جلسة الحساب لا تفتح شيئًا غير صفحة تعيين كلمة مرور جديدة.
--    temp_password_expires_at: موعد انتهاء كلمة مرور مؤقتة أصدرها المالك. يُقدَّم إلى الآن
--    عند أول دخول ناجح بها، فلا تعمل إلا مرة واحدة. فارغ = لا توجد كلمة مؤقتة.
--    قيمة ثابتة، فلا إعادة كتابة للجدول (Postgres 11+).
-- ---------------------------------------------------------------------
alter table users add column must_change_password boolean not null default false;
alter table users add column temp_password_expires_at timestamptz;

-- ---------------------------------------------------------------------
-- 2) روابط تأكيد البريد
--    id = SHA-256 للرمز (لا يُخزَّن الرمز نفسه). email هو العنوان الذي يؤكده هذا الرابط:
--    عند تصحيح الطالب لبريده لا يتغير حسابه قبل فتح الرابط من العنوان الجديد.
-- ---------------------------------------------------------------------
create table email_verification_tokens (
  id text primary key check (char_length(id) = 64),
  user_id uuid not null references users(id) on delete cascade,
  email citext not null check (char_length(email) between 5 and 254),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_verification_user_idx on email_verification_tokens (user_id, created_at desc);
alter table email_verification_tokens enable row level security;

-- ---------------------------------------------------------------------
-- 3) ما يراه المالك عن البريد: الإخفاقات وآخر إرسال ناجح
-- ---------------------------------------------------------------------
create index email_log_status_idx on email_log (status, created_at desc);

-- ---------------------------------------------------------------------
-- 4) مسح روابط الاستعادة التي خُزّنت كاملة في وضع log قبل هذا الترحيل
-- ---------------------------------------------------------------------
update email_log
set body = regexp_replace(body, '([?&]token=)[^[:space:]&]+', '\1[REDACTED]', 'g')
where body like '%token=%';
