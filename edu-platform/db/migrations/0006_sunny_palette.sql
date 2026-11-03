-- =====================================================================
-- 0006: ألوان «الفصل المشمس» (فيروزي #0a6b66 وذهبي #ffc531)
-- يُحدَّث اللون فقط إن كان ما زال القيمة الافتراضية السابقة؛ الألوان التي اختارها المالك لا تُلمس
-- =====================================================================
update settings set value = '"#0a6b66"'::jsonb, updated_at = now() where key = 'primary_color' and value = '"#0c6b66"'::jsonb;
update settings set value = '"#ffc531"'::jsonb, updated_at = now() where key = 'accent_color' and value = '"#f2c230"'::jsonb;
