import { resolve } from "node:path";

/** قيم بيئة الاختبار — مشتركة بين global-setup و setup-env */
export const SIM_PORT = 4590;
export const SIM_API_KEY = "test-key";
export const WEBHOOK_SECRET = "test-webhook-secret";
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://edu:edu_local_pw@localhost:5432/edu_test";
export const TEST_STORAGE_DIR = resolve(__dirname, ".tmp/storage");

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  DATABASE_POOL_MAX: "5",
  APP_SECRET: "test-app-secret-0123456789abcdef-0123456789",
  APP_URL: "http://localhost:3000",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: TEST_STORAGE_DIR,
  MAIL_DRIVER: "log",
  PAYMENTS_MODE: "sandbox",
  MYFATOORAH_API_KEY: SIM_API_KEY,
  MYFATOORAH_BASE_URL: `http://127.0.0.1:${SIM_PORT}`,
  MYFATOORAH_WEBHOOK_SECRET: WEBHOOK_SECRET,
  MYFATOORAH_LIVE_CONFIRMED: "false",
  TRUST_PROXY: "true",
};
