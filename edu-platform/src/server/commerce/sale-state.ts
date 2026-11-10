import "server-only";
import type { Db } from "../db";
import { readSettings } from "../platform/settings";
import { closedVideoProductIds } from "../video/policy";
import { defectiveProductIds } from "./cart";

export type ProductSaleState = { videoClosed: boolean; defective: boolean };

/**
 * حالة بيع منتج لعرض صفحته: الفحوص نفسها التي تمنع السلة والدفع، بلا ما يخص أحدًا بعينه.
 * قراءة حية دائمًا هنا. الصفحات العامة تأخذها عبر catalog/public-data، ومعاينة غير المنشور تستدعيها مباشرة.
 */
export async function readProductSaleState(db: Db, productId: string): Promise<ProductSaleState> {
  const settings = await readSettings(db);
  const [closed, defective] = await Promise.all([closedVideoProductIds(db, [productId], settings), defectiveProductIds([productId], db, settings)]);
  return { videoClosed: closed.has(productId), defective: defective.has(productId) };
}
