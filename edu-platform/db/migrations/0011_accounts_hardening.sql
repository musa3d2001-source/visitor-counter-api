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
-- 4) التحقق بخطوتين لحسابات الإدارة
--    user_totp: سر TOTP مشفّر (AES-256-GCM بمفتاح مشتق من APP_SECRET)، ولا يُخزَّن خامًا أبدًا.
--    enabled_at فارغ = تسجيل لم يكتمل. pending_session_id يربط السر قيد التسجيل بالجلسة التي
--    فتحته، فلا تفيد جلسة أخرى تعرف كلمة المرور في قراءته أو إكماله.
--    last_used_step: آخر خطوة زمنية قُبلت، والقبول لا يكون إلا لخطوة أكبر منها (منع إعادة الاستخدام).
-- ---------------------------------------------------------------------
create table user_totp (
  user_id uuid primary key references users(id) on delete cascade,
  secret_ciphertext text not null check (char_length(secret_ciphertext) between 20 and 500),
  enabled_at timestamptz,
  pending_session_id text check (pending_session_id is null or char_length(pending_session_id) = 64),
  last_used_step bigint,
  created_at timestamptz not null default now()
);
alter table user_totp enable row level security;

-- رموز الاسترداد: HMAC-SHA-256 بمفتاح مشتق من APP_SECRET. الرمز الخام يظهر مرة واحدة ولا يُخزَّن
create table user_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null check (char_length(code_hash) = 64),
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_recovery_codes_user_idx on user_recovery_codes (user_id) where used_at is null;
alter table user_recovery_codes enable row level security;

-- خطوة كلمة المرور المعلقة: id = SHA-256 لرمز عشوائي في كوكي httpOnly. قصيرة العمر ومرتبطة بالحساب
create table login_challenges (
  id text primary key check (char_length(id) = 64),
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);
create index login_challenges_user_idx on login_challenges (user_id);
create index login_challenges_expiry_idx on login_challenges (expires_at);
alter table login_challenges enable row level security;

-- ---------------------------------------------------------------------
-- 5) الجلسة التي اجتازت العامل الثاني
--    عمود فارغ بلا قيمة افتراضية، فلا إعادة كتابة للجدول، والكود المنشور حاليًا لا يتأثر به.
--    جلسة مدير بلا هذا الختم لا تعمل على حساب فعّل التحقق بخطوتين.
-- ---------------------------------------------------------------------
alter table sessions add column two_factor_at timestamptz;

-- ---------------------------------------------------------------------
-- 6) مسح روابط الاستعادة التي خُزّنت كاملة في وضع log قبل هذا الترحيل
-- ---------------------------------------------------------------------
update email_log
set body = regexp_replace(body, '([?&]token=)[^[:space:]&]+', '\1[REDACTED]', 'g')
where body like '%token=%';
