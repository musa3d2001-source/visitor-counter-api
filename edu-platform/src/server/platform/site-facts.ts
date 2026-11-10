import "server-only";
import { cache } from "react";
import { authPerks, type SiteFacts } from "@/lib/site-truth";
import { catalogOfferings } from "../catalog/public-data";
import { paymentPublicState } from "../payments/public-state";

/** ما هو صحيح عن الموقع الآن. مرة واحدة لكل طلب، وكل نص عام يعتمد عليه */
export const siteFacts = cache(async (): Promise<SiteFacts> => {
  const offered = await catalogOfferings();
  return { payment: paymentPublicState(), ...offered };
});

/** مزايا صفحات الدخول كما هي صحيحة الآن. تقرؤها الصفحة وتمررها لبطاقتها */
export const authPagePerks = async () => authPerks(await siteFacts());
