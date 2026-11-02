/**
 * تشغيل محاكي MyFatoorah كخدمة مستقلة لاختبارات E2E (بديل اختبار فقط — ليس للإنتاج):
 *   npx tsx tests/mocks/run-simulator.ts --port 4010 \
 *     --webhook http://localhost:3000/api/payments/myfatoorah/webhook --secret xyz --duplicate
 * ثم شغّل التطبيق بـ:
 *   PAYMENTS_MODE=sandbox MYFATOORAH_BASE_URL=http://127.0.0.1:4010 MYFATOORAH_API_KEY=sim-key MYFATOORAH_WEBHOOK_SECRET=xyz
 */
import { startSimulator } from "./myfatoorah-simulator";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

async function main() {
  const sim = await startSimulator({
    port: Number(arg("port", "4010")),
    host: arg("host", "127.0.0.1"),
    apiKey: arg("api-key", process.env.MYFATOORAH_API_KEY ?? "sim-key")!,
    webhookUrl: arg("webhook"),
    webhookSecret: arg("secret", process.env.MYFATOORAH_WEBHOOK_SECRET),
    duplicateWebhooks: arg("duplicate") === "true",
    webhookDelayMs: Number(arg("webhook-delay", "0")),
  });
  console.log(`[myfatoorah-simulator] listening on ${sim.url} (TEST DOUBLE — not for production)`);
  const stop = async () => {
    await sim.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
