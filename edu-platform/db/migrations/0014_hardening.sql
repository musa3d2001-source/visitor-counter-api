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
