"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { saveSettings, settingsSchema, SETTINGS_LABELS, type PlatformSettings } from "@/server/platform/settings";
import { audit } from "@/server/platform/audit";
import { storage } from "@/server/storage";
import { getSettings } from "@/server/platform/settings";
import { AdminError, adminAction, bool, str } from "@/server/admin/common";
import { parseKwdToFils } from "@/lib/money";

const FIELD_LABELS: Record<string, string> = SETTINGS_LABELS;

export async function saveSettingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return adminAction(async ({ adminId, ip }) => {
    // تُقرأ قبل الحفظ: هي ما يصف التغيير في سجل التدقيق
    const before = await getSettings();
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
      seller_legal_name: str(fd, "seller_legal_name"),
      seller_license_number: str(fd, "seller_license_number"),
      seller_address: str(fd, "seller_address"),
      mail_provider_name: str(fd, "mail_provider_name"),
    };
    // الاعتماد مرة واحدة بخانة صريحة، ولا يتغير تاريخه بحفظ لاحق
    const confirmsFeeRules = bool(fd, "fee_rules_confirm") && before.fee_rules_confirmed_at === null;
    if (confirmsFeeRules) patch.fee_rules_confirmed_at = new Date().toISOString();
    const parsed = settingsSchema.partial().safeParse(patch);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        if (!errs[k]) errs[k] = k === "instagram_url" ? `«${FIELD_LABELS[k]}» يجب أن يبدأ بـ https://` : `قيمة غير صحيحة في «${FIELD_LABELS[k] ?? k}»`;
      }
      throw new AdminError(Object.values(errs).join("، "), errs);
    }
    const [a, b] = (parsed.data.academic_year ?? "2026-2027").split("-").map(Number);
    if (b !== a + 1) throw new AdminError("العام الدراسي غير صحيح (مثال: 2026-2027)");
    await saveSettings(parsed.data, adminId);
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

