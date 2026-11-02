-- =====================================================================
-- 0005: لوحة الألوان الجديدة (إعادة التصميم «جدول الحصص»)
-- يُحدَّث اللون فقط إن كان ما زال القيمة الافتراضية القديمة — لا نلمس ألوانًا اختارها المالك
-- =====================================================================
update settings set value = '"#0c6b66"'::jsonb, updated_at = now() where key = 'primary_color' and value = '"#0f5257"'::jsonb;
update settings set value = '"#f2c230"'::jsonb, updated_at = now() where key = 'accent_color' and value = '"#d4973b"'::jsonb;
