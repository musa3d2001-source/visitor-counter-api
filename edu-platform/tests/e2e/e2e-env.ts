import { resolve } from "node:path";

/** إعدادات بيئة E2E — خادم إنتاجي (next start) منفصل بقاعدة بيانات وتخزين مستقلين */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_SIM_PORT = Number(process.env.E2E_SIM_PORT ?? 4010);
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://edu:edu_local_pw@localhost:5432/edu_e2e";
export const E2E_STORAGE_DIR = resolve(__dirname, "../.tmp/e2e-storage");
export const E2E_ADMIN = { email: "admin-e2e@example.com", password: "Admin-E2E-Pass-2026" };
export const E2E_SIM_KEY = "sim-key";
export const E2E_BUNNY_PORT = Number(process.env.E2E_BUNNY_PORT ?? 4020);
export const E2E_BUNNY = {
  library: "424242",
  apiKey: "bunny-sim-api-key",
  tokenKey: "bunny-sim-token-key",
  readonlyKey: "bunny-sim-readonly-key",
  base: `http://127.0.0.1:${Number(process.env.E2E_BUNNY_PORT ?? 4020)}`,
};
export const E2E_WEBHOOK_SECRET = "e2e-webhook-secret";
export const E2E_SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 4026);
export const E2E_SINK_URL = `http://127.0.0.1:${Number(process.env.E2E_SINK_HTTP_PORT ?? 4027)}`;
export const E2E_MAIL_PORT = Number(process.env.E2E_MAIL_PORT ?? 3101);
export const E2E_MAIL_BASE_URL = `http://localhost:${E2E_MAIL_PORT}`;
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789abcdef";
export const E2E_OPS_ALERT_EMAIL = "owner-ops@darb-e2e.test";

export const E2E_SERVER_ENV: Record<string, string> = {
  NODE_ENV: "production",
  PORT: String(E2E_PORT),
  APP_URL: E2E_BASE_URL,
  DATABASE_URL: E2E_DATABASE_URL,
  APP_SECRET: "e2e-app-secret-0123456789abcdef-0123456789",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: E2E_STORAGE_DIR,
  MAIL_DRIVER: "log",
  PAYMENTS_MODE: "sandbox",
  MYFATOORAH_BASE_URL: `http://127.0.0.1:${E2E_SIM_PORT}`,
  MYFATOORAH_API_KEY: E2E_SIM_KEY,
  MYFATOORAH_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
  // الخادم هنا NODE_ENV=production مع بوابة محاكاة: السماح صريح ومقصود
  ALLOW_SANDBOX_ON_PRODUCTION: "true",
  TRUST_PROXY: "true",
  // حساب المدير في بقية الرحلات بلا تحقق بخطوتين. المسار الإلزامي يغطيه 10-admin-two-factor على خادم مستقل
  ADMIN_2FA_REQUIRED: "false",
  CRON_SECRET: E2E_CRON_SECRET,
  OPS_ALERT_EMAIL: E2E_OPS_ALERT_EMAIL,
  // الفيديو عبر محاكي Bunny Stream (بديل اختبار مطابق للعقد الموثق)
  VIDEO_PROVIDER: "bunny",
  BUNNY_STREAM_LIBRARY_ID: E2E_BUNNY.library,
  BUNNY_STREAM_API_KEY: E2E_BUNNY.apiKey,
  BUNNY_STREAM_TOKEN_KEY: E2E_BUNNY.tokenKey,
  BUNNY_STREAM_READONLY_API_KEY: E2E_BUNNY.readonlyKey,
  BUNNY_STREAM_API_BASE: E2E_BUNNY.base,
  BUNNY_STREAM_TUS_ENDPOINT: `${E2E_BUNNY.base}/tusupload`,
  BUNNY_STREAM_EMBED_BASE: E2E_BUNNY.base,
};

export const E2E_TWO_FACTOR_PORT = Number(process.env.E2E_TWO_FACTOR_PORT ?? 3102);
export const E2E_TWO_FACTOR_BASE_URL = `http://localhost:${E2E_TWO_FACTOR_PORT}`;

/** خادم إنتاج ثالث بالافتراضي الحقيقي: المتغير غير مضبوط، فالتحقق بخطوتين إلزامي */
export const E2E_TWO_FACTOR_SERVER_ENV: Record<string, string> = Object.fromEntries(
  Object.entries({ ...E2E_SERVER_ENV, PORT: String(E2E_TWO_FACTOR_PORT), APP_URL: E2E_TWO_FACTOR_BASE_URL }).filter(([key]) => key !== "ADMIN_2FA_REQUIRED"),
);

/** خادم ثانٍ من البناء نفسها وقاعدة البيانات نفسها، ببريد SMTP حقيقي إلى خادم اختبار محلي */
export const E2E_MAIL_SERVER_ENV: Record<string, string> = {
  ...E2E_SERVER_ENV,
  PORT: String(E2E_MAIL_PORT),
  APP_URL: E2E_MAIL_BASE_URL,
  MAIL_DRIVER: "smtp",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(E2E_SMTP_PORT),
  SMTP_SECURE: "false",
  MAIL_FROM: "منصة فرقد <no-reply@farqad.test>",
};
