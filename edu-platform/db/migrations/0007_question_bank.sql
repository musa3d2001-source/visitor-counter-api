-- =====================================================================
-- 0007: بنك أسئلة الكتاب
--   الكتب ← الوحدات ← (الفصول اختيارًا) ← دروس المنهج ← الأسئلة وخياراتها، والبلاغات، ومحاولات الإجابة العامة.
--   جداول جديدة فقط: لا يُغيَّر أي صف قائم. دروس الفيديو (lessons) منفصلة تمامًا عن دروس المنهج.
--   سير الاعتماد: draft → in_review → published، أو عودة إلى draft بملاحظة، أو archived.
--   المنشور لا يُعدَّل: التعديل نسخة جديدة (revision_of) تحل محله عند اعتمادها.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الكتب المدرسية: كتاب لكل مادة وفصل، والطبعة مستقلة لأن الصفحات تتغير بين الطبعات
-- ---------------------------------------------------------------------
create table textbooks (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete restrict,
  term smallint not null check (term in (1, 2)),
  title text not null check (char_length(title) between 2 and 160),
  edition text not null check (char_length(edition) between 1 and 60),
  is_current boolean not null default true,
  rights_confirmed_at timestamptz,
  rights_confirmed_by uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index textbooks_current_idx on textbooks (subject_id, term) where is_current;
create index textbooks_subject_idx on textbooks (subject_id, term);
create trigger textbooks_updated before update on textbooks for each row execute function set_updated_at();

create table curriculum_units (
  id uuid primary key default gen_random_uuid(),
  textbook_id uuid not null references textbooks(id) on delete cascade,
  number smallint not null check (number between 1 and 99),
  title text not null check (char_length(title) between 2 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (textbook_id, number)
);
create trigger curriculum_units_updated before update on curriculum_units for each row execute function set_updated_at();

-- الفصل (chapter) مستوى اختياري بين الوحدة والدرس كما في كتب العلوم الجديدة: الوحدة ← الفصل ← الدرس،
-- وترقيم الدروس يبدأ من جديد في كل فصل. يُخزَّن في صف الدرس (رقمه وعنوانه) لأنه لا يحمل بيانات أخرى،
-- والخادم يوحّد عنوان الفصل في كل دروسه. كتاب بلا فصول يتركهما فارغين.
create table curriculum_lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references curriculum_units(id) on delete cascade,
  chapter_number smallint check (chapter_number between 1 and 20),
  chapter_title text check (char_length(chapter_title) between 2 and 160),
  number smallint not null check (number between 1 and 99),
  title text not null check (char_length(title) between 2 and 160),
  page_start integer not null check (page_start between 1 and 2000),
  page_end integer not null check (page_end between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (page_end >= page_start),
  check ((chapter_number is null) = (chapter_title is null))
);
-- رقم الدرس فريد داخل الفصل (أو داخل الوحدة لكتاب بلا فصول)
create unique index curriculum_lessons_number_idx on curriculum_lessons (unit_id, (coalesce(chapter_number, 0)), number);
create trigger curriculum_lessons_updated before update on curriculum_lessons for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2) الأسئلة
--    root_id: هوية السؤال عبر نسخه (الأصل = نفسه)، فلا يُعدّ تصحيح خطأ إملائي سؤالًا «جديدًا» على الطالب.
--    teacher_id: null = محتوى المنصة (أدخله المالك).
-- ---------------------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null,
  revision_of uuid references questions(id) on delete restrict,
  version smallint not null default 1 check (version between 1 and 999),
  lesson_id uuid not null references curriculum_lessons(id) on delete restrict,
  page integer not null check (page between 1 and 2000),
  exercise_ref text check (exercise_ref is null or char_length(exercise_ref) between 1 and 40),
  source_kind text not null check (source_kind in ('textbook_exercise', 'textbook_based', 'teacher_original', 'demo')),
  type text not null check (type in ('mcq', 'true_false')),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  stem text not null check (char_length(stem) between 3 and 400),
  explanation text not null check (char_length(explanation) between 20 and 600),
  hint text check (hint is null or char_length(hint) between 1 and 200),
  difficulty smallint not null check (difficulty between 1 and 3),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'archived')),
  teacher_id uuid references teachers(id) on delete restrict,
  created_by uuid references users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  published_at timestamptz,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  rights_confirmed_at timestamptz,
  rights_confirmed_by uuid references users(id) on delete set null,
  paused boolean not null default false,
  paused_reason text check (paused_reason is null or paused_reason in ('reports', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paused or paused_reason is null)
);
create index questions_lesson_idx on questions (lesson_id, status);
create index questions_teacher_idx on questions (teacher_id, status);
create index questions_review_idx on questions (status, submitted_at) where status = 'in_review';
create index questions_hash_idx on questions (content_hash);
-- نسخة منشورة واحدة لكل سؤال، ونسخة مفتوحة (مسودة أو مراجعة) واحدة على الأكثر
create unique index questions_one_published_idx on questions (root_id) where status = 'published';
create unique index questions_one_open_idx on questions (root_id) where status in ('draft', 'in_review');
create trigger questions_updated before update on questions for each row execute function set_updated_at();

create table question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  text text not null check (char_length(text) between 1 and 200),
  is_correct boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, position)
);
create unique index question_choices_one_correct_idx on question_choices (question_id) where is_correct;
create trigger question_choices_updated before update on question_choices for each row execute function set_updated_at();

-- الجذر والإصدار من النسخة السابقة
create or replace function question_set_root() returns trigger
language plpgsql as $$
declare
  prev record;
begin
  if new.revision_of is null then
    new.root_id := new.id;
    new.version := 1;
  else
    select root_id, version into prev from questions where id = new.revision_of;
    if prev is null then
      raise exception 'question revision source not found';
    end if;
    new.root_id := prev.root_id;
    new.version := prev.version + 1;
  end if;
  return new;
end;
$$;
create trigger questions_set_root before insert on questions for each row execute function question_set_root();

-- الصفحة ضمن نطاق صفحات الدرس (دائمًا، لا عند المراجعة فقط)
create or replace function question_page_check() returns trigger
language plpgsql as $$
declare
  l record;
begin
  select page_start, page_end into l from curriculum_lessons where id = new.lesson_id;
  if l is null or new.page < l.page_start or new.page > l.page_end then
    raise exception 'question page outside lesson range';
  end if;
  return new;
end;
$$;
create trigger questions_page_check before insert or update of page, lesson_id on questions
  for each row execute function question_page_check();

-- الانتقالات المسموحة، وقفل المحتوى بعد المسودة، والتحقق قبل المراجعة والنشر
create or replace function question_status_guard() returns trigger
language plpgsql as $$
declare
  n_choices integer;
  n_correct integer;
  n_banned integer;
begin
  if old.status <> 'draft' and (
    new.stem is distinct from old.stem or new.explanation is distinct from old.explanation or
    new.hint is distinct from old.hint or new.type is distinct from old.type or new.lang is distinct from old.lang or
    new.page is distinct from old.page or new.lesson_id is distinct from old.lesson_id or
    new.difficulty is distinct from old.difficulty or new.source_kind is distinct from old.source_kind or
    new.exercise_ref is distinct from old.exercise_ref or new.content_hash is distinct from old.content_hash or
    new.revision_of is distinct from old.revision_of or new.root_id is distinct from old.root_id
  ) then
    raise exception 'question content is locked';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('in_review', 'published', 'archived')) or
      (old.status = 'in_review' and new.status in ('draft', 'published', 'archived')) or
      (old.status = 'published' and new.status = 'archived')
    ) then
      raise exception 'question status transition not allowed';
    end if;

    if new.status in ('in_review', 'published') then
      select count(*), count(*) filter (where is_correct),
             count(*) filter (where btrim(regexp_replace(regexp_replace(lower(text), '[\u064B-\u065F\u0670\u0640[:punct:]]', '', 'g'), '\s+', ' ', 'g'))
               in ('كل ما سبق', 'جميع ما سبق', 'كل ما ذكر', 'جميع ما ذكر', 'لا شيء مما سبق', 'ليس مما سبق', 'all of the above', 'none of the above'))
        into n_choices, n_correct, n_banned
        from question_choices where question_id = new.id;
      if new.type = 'mcq' and (n_choices < 2 or n_choices > 4) then
        raise exception 'question needs 2 to 4 choices';
      end if;
      if new.type = 'true_false' and n_choices <> 2 then
        raise exception 'question needs 2 to 4 choices';
      end if;
      if n_correct <> 1 then
        raise exception 'question needs exactly one correct choice';
      end if;
      if n_banned > 0 then
        raise exception 'question has a banned choice';
      end if;
      if new.source_kind <> 'demo' and new.rights_confirmed_at is null then
        raise exception 'question rights not confirmed';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger questions_status_guard before update on questions for each row execute function question_status_guard();

-- الخيارات تُعدَّل في المسودة فقط
create or replace function question_choices_guard() returns trigger
language plpgsql as $$
declare
  st text;
begin
  select status into st from questions where id = coalesce(new.question_id, old.question_id);
  if st is not null and st <> 'draft' then
    raise exception 'question choices are locked';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger question_choices_guard before insert or update or delete on question_choices
  for each row execute function question_choices_guard();

-- لا يُضيَّق نطاق صفحات درس فيه أسئلة خارج النطاق الجديد (الخادم يفحص أولًا برسالة عربية)
create or replace function curriculum_lesson_range_check() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from questions where lesson_id = new.id and (page < new.page_start or page > new.page_end)) then
    raise exception 'lesson range excludes existing questions';
  end if;
  return new;
end;
$$;
create trigger curriculum_lessons_range_check before update of page_start, page_end on curriculum_lessons
  for each row execute function curriculum_lesson_range_check();

-- ---------------------------------------------------------------------
-- 3) البلاغات: أسباب محددة بلا نص حر
-- ---------------------------------------------------------------------
create table question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reason text not null check (reason in ('wrong_key', 'unclear', 'typo', 'off_curriculum', 'inappropriate')),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index question_reports_open_idx on question_reports (question_id, user_id) where status = 'open';
create index question_reports_question_idx on question_reports (question_id, status);
create trigger question_reports_updated before update on question_reports for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4) محاولات الإجابة العامة (اللعبة الآن، والمنافسة لاحقًا)
--    التوقيتات كلها من الخادم: served_at عند التسليم، shown_at عند حدث الظهور، answered_at عند الإجابة.
--    game_run_id يُربط بـ game_runs في 0008.
-- ---------------------------------------------------------------------
create table question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  question_id uuid not null references questions(id) on delete restrict,
  context_type text not null check (context_type in ('game', 'questions_only', 'review', 'preview')),
  game_run_id uuid,
  choice_order uuid[] not null check (cardinality(choice_order) between 2 and 4),
  is_challenge boolean not null default false,
  chosen_choice_id uuid references question_choices(id) on delete restrict,
  is_correct boolean,
  first_attempt boolean,
  served_at timestamptz not null default now(),
  shown_at timestamptz,
  answered_at timestamptz,
  response_ms integer check (response_ms is null or response_ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((answered_at is null) = (is_correct is null)),
  check (answered_at is null or chosen_choice_id is not null)
);
create index question_attempts_user_idx on question_attempts (user_id, question_id, answered_at desc);
create index question_attempts_question_idx on question_attempts (question_id) where answered_at is not null;
create index question_attempts_run_idx on question_attempts (game_run_id) where game_run_id is not null;
create trigger question_attempts_updated before update on question_attempts for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 5) RLS على الجداول الجديدة (كما في 0001 و0002)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['textbooks', 'curriculum_units', 'curriculum_lessons', 'questions', 'question_choices', 'question_reports', 'question_attempts'] loop
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
