import "server-only";
import { sql } from "../db";
import { storage } from "../storage";
import { getSettings } from "../platform/settings";
import { watermarkPdf } from "./pdf";

/** بيانات العلامة المائية: بريد المشتري + رقم الطلب الذي منح الصلاحية (إن وجد) */
export async function watermarkIdentity(user: { id: string; email: string }, productId: string) {
  const [row] = await sql<{ number: string }[]>`
    select o.number from entitlements e join orders o on o.id = e.order_id
    where e.user_id = ${user.id} and e.revoked_at is null
      and (e.product_id = ${productId}
           or e.product_id in (select bundle_id from bundle_items where product_id = ${productId}))
    order by o.paid_at desc nulls last limit 1
  `;
  const date = new Date().toISOString().slice(0, 10);
  const ref = row?.number ?? `U-${user.id.slice(0, 8).toUpperCase()}`;
  return {
    primary: `${user.email}  ${ref}`,
    secondary: `Licensed to ${user.email} | ${ref} | ${date} | Personal use only`,
  };
}

/** يقرأ ملف PDF من التخزين الخاص ويختمه بهوية المشتري عند تفعيل العلامة المائية */
export async function loadDeliverablePdf(opts: {
  storageKey: string;
  kind: "main" | "preview";
  user: { id: string; email: string; role: string } | null;
  productId: string;
}): Promise<Uint8Array> {
  const bytes = await storage().read("private", opts.storageKey);
  if (opts.kind !== "main" || !opts.user || opts.user.role === "admin") return bytes;
  const settings = await getSettings();
  if (!settings.watermark_enabled) return bytes;
  return watermarkPdf(bytes, await watermarkIdentity(opts.user, opts.productId));
}

/** تحويل البايتات إلى Stream (الاستجابات المتدفقة لا تخضع لحد 4.5MB في Vercel) */
export function bytesToStream(bytes: Uint8Array, chunkSize = 256 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
  });
}
