"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { saveSettings, settingsSchema, type PlatformSettings } from "@/server/platform/settings";
import { audit } from "@/server/platform/audit";
import { storage } from "@/server/storage";
import { getSettings } from "@/server/platform/settings";
import { AdminError, adminAction, bool, str } from "@/server/admin/common";
import { parseKwdToFils } from "@/lib/money";

const FIELD_LABELS: Record<string, string> = {
  site_name: "اسم المنصة",
  tagline: "الشعار النصي",
  hero_title: "عنوان الصفحة الرئيسية",
  hero_subtitle: "النص التعريفي",
  primary_color: "اللون الأساسي",
  accent_color: "اللون المساعد",
  whatsapp_number: "رقم واتساب",
  contact_email: "البريد",
  contact_phone: "الهاتف",
  instagram_url: "رابط إنستغرام",
  academic_year: "العام الدراسي",
  faq: "الأسئلة الشائعة",
  footer_note: "نص التذييل",
  fee_percent_bps: "نسبة الرسوم",
  fee_fixed_fils: "الرسوم الثابتة",
};

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    let faq: unknown = [];
    try {
      faq = JSON.parse(str(fd, "faq") || "[]");
    } catch {
      throw new AdminError("صيغة الأسئلة الشائعة غير صحيحة");
    }
    const whatsapp = str(fd, "whatsapp_number").replace(/[\s-]/g, "");
    const feePctRaw = str(fd, "fee_percent") || "0";
    const feePct = Number(feePctRaw.replace("٫", "."));
    if (!Number.isFinite(feePct) || feePct < 0 || feePct > 20) throw new AdminError("نسبة الرسوم بين 0 و 20%", { fee_percent_bps: "قيمة غير صحيحة" });
    const feeFixed = parseKwdToFils(str(fd, "fee_fixed") || "0");
    if (feeFixed === null || feeFixed > 10000) throw new AdminError("الرسوم الثابتة غير صحيحة (حتى 10.000 د.ك)", { fee_fixed_fils: "قيمة غير صحيحة" });
    const patch: Partial<PlatformSettings> = {
      site_name: str(fd, "site_name"),
      tagline: str(fd, "tagline"),
      hero_title: str(fd, "hero_title"),
      hero_subtitle: str(fd, "hero_subtitle"),
      primary_color: str(fd, "primary_color").toLowerCase(),
      accent_color: str(fd, "accent_color").toLowerCase(),
      whatsapp_number: whatsapp,
      contact_email: str(fd, "contact_email"),
      contact_phone: str(fd, "contact_phone"),
      instagram_url: str(fd, "instagram_url"),
      academic_year: str(fd, "academic_year"),
      videos_enabled: bool(fd, "videos_enabled"),
      watermark_enabled: bool(fd, "watermark_enabled"),
      faq: faq as PlatformSettings["faq"],
      footer_note: str(fd, "footer_note"),
      fee_percent_bps: Math.round(feePct * 100),
      fee_fixed_fils: feeFixed,
    };
    // الاعتماد مرة واحدة بخانة صريحة، ولا يتغير تاريخه بحفظ لاحق
    const confirmsFeeRules = bool(fd, "fee_rules_confirm") && (await getSettings()).fee_rules_confirmed_at === null;
    if (confirmsFeeRules) patch.fee_rules_confirmed_at = new Date().toISOString();
    const parsed = settingsSchema.partial().safeParse(patch);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        if (!errs[k]) errs[k] = `قيمة غير صحيحة في «${FIELD_LABELS[k] ?? k}»`;
      }
      throw new AdminError(Object.values(errs).join("، "), errs);
    }
    const [a, b] = (parsed.data.academic_year ?? "2026-2027").split("-").map(Number);
    if (b !== a + 1) throw new AdminError("العام الدراسي غير صحيح (مثال: 2026-2027)");
    await saveSettings(parsed.data, adminId);
    const before = await getSettings();
    await audit({
      actorId: adminId,
      action: "settings.update",
      entityType: "settings",
      entityId: "platform",
      metadata: {
        keys: Object.keys(parsed.data),
        ...(before.fee_percent_bps !== parsed.data.fee_percent_bps || before.fee_fixed_fils !== parsed.data.fee_fixed_fils
          ? { fees: { from: [before.fee_percent_bps, before.fee_fixed_fils], to: [parsed.data.fee_percent_bps, parsed.data.fee_fixed_fils] } }
          : {}),
      },
      ip,
    });
    if (confirmsFeeRules) {
      await audit({
        actorId: adminId,
        action: "settings.fee_rules_confirm",
        entityType: "settings",
        entityId: "fee_rules_confirmed_at",
        metadata: { feePercentBps: parsed.data.fee_percent_bps, feeFixedFils: parsed.data.fee_fixed_fils },
        ip,
      });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "تم حفظ الإعدادات وتطبيقها على الموقع" };
  });
}

export async function removeLogoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId }) => {
    const s = await getSettings();
    if (s.logo_key) {
      await saveSettings({ logo_key: null }, adminId);
      await storage().remove("public", s.logo_key).catch(() => {});
      await audit({ actorId: adminId, action: "settings.logo_remove", entityType: "settings", entityId: "logo_key" });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "تمت إزالة الشعار" };
  });
}

