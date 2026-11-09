import "server-only";
import type { PaymentPublicState } from "@/lib/site-truth";
import { paymentsConfig } from "./service";

/** المصدر الوحيد لحال الدفع كما تُقال للزائر. كل ادعاء عن الدفع في الموقع يمر من هنا عبر paymentClaims */
export function paymentPublicState(): PaymentPublicState {
  const cfg = paymentsConfig();
  if (!cfg.enabled) return "off";
  return cfg.environment === "live" ? "live" : "sandbox";
}
