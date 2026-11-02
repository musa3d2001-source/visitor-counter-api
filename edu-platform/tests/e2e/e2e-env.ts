import { resolve } from "node:path";

/** إعدادات بيئة E2E — خادم إنتاجي (next start) منفصل بقاعدة بيانات وتخزين مستقلين */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_SIM_PORT = Number(process.env.E2E_SIM_PORT ?? 4010);
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://edu:edu_local_pw@localhost:5432/edu_e2e";
export const E2E_STORAGE_DIR = resolve(__dirname, "../.tmp/e2e-storage");
export const E2E_ADMIN = { email: "admin-e2e@example.com", password: "Admin-E2E-Pass-2026" };
export const E2E_SIM_KEY = "sim-key";
export const E2E_WEBHOOK_SECRET = "e2e-webhook-secret";

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
  TRUST_PROXY: "true",
};
