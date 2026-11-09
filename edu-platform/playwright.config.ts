import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_BUNNY, E2E_BUNNY_PORT, E2E_MAIL_BASE_URL, E2E_MAIL_SERVER_ENV, E2E_SERVER_ENV, E2E_SIM_KEY, E2E_SIM_PORT, E2E_SINK_URL, E2E_SMTP_PORT, E2E_TWO_FACTOR_BASE_URL, E2E_TWO_FACTOR_SERVER_ENV, E2E_WEBHOOK_SECRET } from "./tests/e2e/e2e-env";

/**
 * اختبارات E2E (Playwright) — تعمل على Chromium المثبت مسبقًا بقياسات iPhone و iPad والكمبيوتر.
 *
 * المتطلبات قبل التشغيل:
 *  - خادم التطبيق يعمل على E2E_BASE_URL (افتراضيًا http://localhost:3000) بالإعدادات:
 *      PAYMENTS_MODE=sandbox MYFATOORAH_BASE_URL=http://127.0.0.1:4010
 *      MYFATOORAH_API_KEY=sim-key MYFATOORAH_WEBHOOK_SECRET=e2e-webhook-secret
 *  - محاكي MyFatoorah (بديل اختبار) يُشغَّل تلقائيًا أدناه على المنفذ 4010
 *    ويرسل Webhook موقّعًا (مرتين لاختبار منع التكرار) إلى خادم التطبيق.
 */
const baseURL = E2E_BASE_URL;
const simPort = E2E_SIM_PORT;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "ar-KW",
    timezoneId: "Asia/Kuwait",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" } },
    { name: "ipad", use: { ...devices["iPad (gen 7)"], browserName: "chromium", defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: `npx tsx tests/mocks/run-simulator.ts --port ${simPort} --api-key ${E2E_SIM_KEY} --webhook ${baseURL}/api/payments/myfatoorah/webhook --secret ${E2E_WEBHOOK_SECRET} --duplicate`,
      url: `http://127.0.0.1:${simPort}/__sim/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // محاكي Bunny Stream (بديل اختبار) — رفع TUS، معالجة، Webhook موقّع، تضمين موقّع
      command: `npx tsx tests/mocks/run-bunny-simulator.ts --port ${E2E_BUNNY_PORT} --library ${E2E_BUNNY.library} --api-key ${E2E_BUNNY.apiKey} --token-key ${E2E_BUNNY.tokenKey} --readonly-key ${E2E_BUNNY.readonlyKey} --webhook ${baseURL}/api/video/bunny/webhook --delay 300 --duplicate`,
      url: `${E2E_BUNNY.base}/__sim/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // يتطلب بناءً مسبقًا: npm run build
      command: `npx next start -p ${E2E_SERVER_ENV.PORT}`,
      url: `${baseURL}/robots.txt`,
      env: E2E_SERVER_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // خادم SMTP محلي (بديل اختبار): يستقبل ما يرسله nodemailer فعليًا ولا يوصله لأحد
      command: `npx tsx tests/mocks/run-smtp-sink.ts --port ${E2E_SMTP_PORT} --http ${new URL(E2E_SINK_URL).port}`,
      url: `${E2E_SINK_URL}/__sink/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx next start -p ${E2E_MAIL_SERVER_ENV.PORT}`,
      url: `${E2E_MAIL_BASE_URL}/robots.txt`,
      env: E2E_MAIL_SERVER_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // الافتراضي الحقيقي للإنتاج: التحقق بخطوتين إلزامي على حسابات الإدارة
      command: `npx next start -p ${E2E_TWO_FACTOR_SERVER_ENV.PORT}`,
      url: `${E2E_TWO_FACTOR_BASE_URL}/robots.txt`,
      env: E2E_TWO_FACTOR_SERVER_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
