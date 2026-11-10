import "server-only";
import { cache } from "react";
import { publicCached } from "./public-cache";
import { readSettings, type PlatformSettings } from "./settings";

/**
 * ما يظهر من الإعدادات لكل زائر: الاسم والشعار والألوان ووسائل التواصل وهوية البائع.
 * للعرض في الصفحات العامة فقط. الدفع والسلة والوصول والإدارة يقرؤون getSettings من قاعدة البيانات دائمًا،
 * ولذلك رسوم المعلمين واعتمادها والعلامة المائية ليست هنا أصلًا.
 */
const PUBLIC_SETTING_KEYS = [
  "site_name",
  "tagline",
  "hero_title",
  "hero_subtitle",
  "logo_key",
  "primary_color",
  "accent_color",
  "whatsapp_number",
  "contact_email",
  "contact_phone",
  "instagram_url",
  "academic_year",
  "videos_enabled",
  "faq",
  "footer_note",
  "seller_legal_name",
  "seller_license_number",
  "seller_address",
  "mail_provider_name",
] as const satisfies readonly (keyof PlatformSettings)[];

export type PublicSettings = Pick<PlatformSettings, (typeof PUBLIC_SETTING_KEYS)[number]>;

async function readPublicSettings(): Promise<PublicSettings> {
  const all = await readSettings();
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((key) => [key, all[key]])) as PublicSettings;
}

/** مرة واحدة لكل طلب، ومن الذاكرة بين الطلبات */
export const getPublicSettings = cache((): Promise<PublicSettings> => publicCached("settings", readPublicSettings));
