import "server-only";
import { cache } from "react";
import type { SiteFacts } from "@/lib/site-truth";
import { catalogOfferings } from "../catalog/queries";
import { paymentPublicState } from "../payments/public-state";

/** ما هو صحيح عن الموقع الآن. مرة واحدة لكل طلب، وكل نص عام يعتمد عليه */
export const siteFacts = cache(async (): Promise<SiteFacts> => {
  const offered = await catalogOfferings();
  return { payment: paymentPublicState(), ...offered };
});
