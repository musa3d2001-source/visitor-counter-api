/**
 * تشغيل محاكي Bunny Stream كخدمة مستقلة لاختبارات E2E (بديل اختبار فقط — ليس للإنتاج):
 *   npx tsx tests/mocks/run-bunny-simulator.ts --port 4020 --library 424242 \
 *     --api-key bunny-sim-api-key --token-key bunny-sim-token-key --readonly-key bunny-sim-readonly-key \
 *     --webhook http://localhost:3000/api/video/bunny/webhook --delay 300 --duplicate
 * ثم شغّل التطبيق بـ:
 *   VIDEO_PROVIDER=bunny BUNNY_STREAM_LIBRARY_ID=424242 BUNNY_STREAM_API_KEY=bunny-sim-api-key
 *   BUNNY_STREAM_TOKEN_KEY=bunny-sim-token-key BUNNY_STREAM_READONLY_API_KEY=bunny-sim-readonly-key
 *   BUNNY_STREAM_API_BASE=http://127.0.0.1:4020 BUNNY_STREAM_TUS_ENDPOINT=http://127.0.0.1:4020/tusupload
 *   BUNNY_STREAM_EMBED_BASE=http://127.0.0.1:4020
 */
import { startBunnySimulator } from "./bunny-simulator";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

async function main() {
  const sim = await startBunnySimulator({
    port: Number(arg("port", "4020")),
    host: arg("host", "127.0.0.1"),
    libraryId: arg("library", "424242"),
    apiKey: arg("api-key", "bunny-sim-api-key"),
    tokenKey: arg("token-key", "bunny-sim-token-key"),
    readOnlyKey: arg("readonly-key", "bunny-sim-readonly-key"),
    webhookUrl: arg("webhook"),
    processingDelayMs: Number(arg("delay", "300")),
    duplicateWebhooks: arg("duplicate") === "true",
    defaultLengthSeconds: Number(arg("length", "42")),
  });
  console.log(`[bunny-simulator] listening on ${sim.url} library=${sim.libraryId} (TEST DOUBLE — not for production)`);
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
