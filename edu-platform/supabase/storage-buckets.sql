-- =====================================================================
-- إعداد حاويات Supabase Storage — شغّله مرة واحدة من SQL Editor في Supabase
-- private-content: ملفات PDF والفيديو (خاصة تمامًا — الوصول عبر الخادم فقط بمفتاح service_role)
-- public-media   : أغلفة المنتجات والشعار (عامة للقراءة)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('private-content', 'private-content', false, 2147483648, array['application/pdf', 'video/mp4']),
  ('public-media', 'public-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- لا نضيف أي سياسات RLS على storage.objects للحاوية الخاصة:
-- => لا يستطيع anon أو authenticated قراءة أو رفع أي ملف خاص.
-- الرفع يتم عبر روابط رفع موقّعة يصدرها الخادم بعد التحقق من صلاحية المدير،
-- والقراءة تتم من الخادم بمفتاح service_role بعد التحقق من ملكية الطالب.
